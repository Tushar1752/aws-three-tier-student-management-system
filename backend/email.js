require("dotenv").config();

const express = require("express");
const { google } = require("googleapis");
const { OAuth2Client } = require("google-auth-library");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const tokenPath = path.join(__dirname, ".gmail-token.json");

const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Gmail authentication
function getGmail() {
    if (!fs.existsSync(tokenPath)) {
        throw new Error("Gmail not connected. Login first.");
    }

    const tokens = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
    oauth2Client.setCredentials(tokens);

    return google.gmail({
        version: "v1",
        auth: oauth2Client
    });
}

// Save refreshed OAuth tokens
oauth2Client.on("tokens", (newTokens) => {
    let currentTokens = {};

    if (fs.existsSync(tokenPath)) {
        currentTokens = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
    }

    fs.writeFileSync(
        tokenPath,
        JSON.stringify({ ...currentTokens, ...newTokens }),
        { mode: 0o600 }
    );
});

// Encode email in Base64 URL format
function encodeEmail(message) {
    return Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

// Decode email body
function decodeBody(data) {
    if (!data) return "";

    return Buffer.from(
        data.replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
    ).toString("utf8");
}

// Get email body
function getBody(payload) {
    if (payload.body?.data) {
        return decodeBody(payload.body.data);
    }

    for (const part of payload.parts || []) {
        if (part.mimeType === "text/plain" && part.body?.data) {
            return decodeBody(part.body.data);
        }
    }

    for (const part of payload.parts || []) {
        const body = getBody(part);
        if (body) return body;
    }

    return "";
}

// Get email header
function getHeader(headers, name) {
    return headers.find(
        h => h.name.toLowerCase() === name.toLowerCase()
    )?.value || "";
}

// 1. Gmail Login
router.get("/auth/google", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.modify",
            "openid",
            "email",
            "profile"
        ]
    });

    res.redirect(url);
});

// 2. OAuth Callback
router.get("/auth/google/callback", async (req, res) => {
    try {
        const { tokens } = await oauth2Client.getToken(req.query.code);

        fs.writeFileSync(
            tokenPath,
            JSON.stringify(tokens),
            { mode: 0o600 }
        );

        res.send("Gmail connected successfully!");
    } catch (error) {
        console.error(error);
        res.status(500).send("Gmail authentication failed");
    }
});

// 3. Get Inbox
router.get("/inbox", async (req, res) => {
    try {
        const gmail = getGmail();

        const response = await gmail.users.messages.list({
            userId: "me",
            labelIds: ["INBOX"],
            maxResults: Math.min(Number(req.query.limit) || 20, 100)
        });

        const messages = response.data.messages || [];

        const emails = await Promise.all(
            messages.map(async message => {
                const result = await gmail.users.messages.get({
                    userId: "me",
                    id: message.id,
                    format: "metadata",
                    metadataHeaders: ["From", "Subject", "Date"]
                });

                const headers = result.data.payload.headers;

                return {
                    id: message.id,
                    from: getHeader(headers, "From"),
                    subject: getHeader(headers, "Subject"),
                    date: getHeader(headers, "Date"),
                    snippet: result.data.snippet
                };
            })
        );

        res.json(emails);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Read Email
router.get("/:id", async (req, res) => {
    try {
        const gmail = getGmail();

        const response = await gmail.users.messages.get({
            userId: "me",
            id: req.params.id,
            format: "full"
        });

        const headers = response.data.payload.headers;

        res.json({
            id: response.data.id,
            threadId: response.data.threadId,
            from: getHeader(headers, "From"),
            to: getHeader(headers, "To"),
            subject: getHeader(headers, "Subject"),
            date: getHeader(headers, "Date"),
            body: getBody(response.data.payload)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Send Email
router.post("/send", async (req, res) => {
    try {
        const { to, subject, text } = req.body;

        if (!to || !subject || !text) {
            return res.status(400).json({
                error: "to, subject and text are required"
            });
        }

        const message = [
            `To: ${to}`,
            `Subject: ${subject}`,
            "MIME-Version: 1.0",
            'Content-Type: text/plain; charset="UTF-8"',
            "",
            text
        ].join("\r\n");

        const gmail = getGmail();

        const response = await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: encodeEmail(message)
            }
        });

        res.json({
            message: "Email sent successfully",
            id: response.data.id
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Reply to Email
router.post("/:id/reply", async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: "Reply text is required" });
        }

        const gmail = getGmail();

        const original = await gmail.users.messages.get({
            userId: "me",
            id: req.params.id,
            format: "full"
        });

        const headers = original.data.payload.headers;
        const to = getHeader(headers, "From");
        const subject = getHeader(headers, "Subject");
        const messageId = getHeader(headers, "Message-ID");
        const references = getHeader(headers, "References");

        const replySubject = subject.startsWith("Re:")
            ? subject
            : `Re: ${subject}`;

        const reply = [
            `To: ${to}`,
            `Subject: ${replySubject}`,
            messageId ? `In-Reply-To: ${messageId}` : "",
            messageId ? `References: ${references} ${messageId}`.trim() : "",
            "MIME-Version: 1.0",
            'Content-Type: text/plain; charset="UTF-8"',
            "",
            text
        ].filter(Boolean).join("\r\n");

        const response = await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: encodeEmail(reply),
                threadId: original.data.threadId
            }
        });

        res.json({
            message: "Reply sent successfully",
            id: response.data.id
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. Forward Email (text body only)
router.post("/:id/forward", async (req, res) => {
    try {
        const { to, text = "" } = req.body;

        if (!to) {
            return res.status(400).json({ error: "Recipient is required" });
        }

        const gmail = getGmail();

        const original = await gmail.users.messages.get({
            userId: "me",
            id: req.params.id,
            format: "full"
        });

        const headers = original.data.payload.headers;
        const originalBody = getBody(original.data.payload);

        const forwardedMessage = [
            `To: ${to}`,
            `Subject: Fwd: ${getHeader(headers, "Subject")}`,
            "MIME-Version: 1.0",
            'Content-Type: text/plain; charset="UTF-8"',
            "",
            text,
            "",
            "---------- Forwarded message ----------",
            `From: ${getHeader(headers, "From")}`,
            `Date: ${getHeader(headers, "Date")}`,
            `Subject: ${getHeader(headers, "Subject")}`,
            `To: ${getHeader(headers, "To")}`,
            "",
            originalBody
        ].join("\r\n");

        const response = await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: encodeEmail(forwardedMessage)
            }
        });

        res.json({
            message: "Email forwarded successfully",
            id: response.data.id
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 8. Move Email to Trash
router.delete("/:id", async (req, res) => {
    try {
        const gmail = getGmail();

        await gmail.users.messages.trash({
            userId: "me",
            id: req.params.id
        });

        res.json({ message: "Email moved to trash successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;


