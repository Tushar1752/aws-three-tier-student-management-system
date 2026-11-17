AWS Three-Tier Student Management System

A Student Management System built using a three-tier architecture and deployed on AWS EC2.

Architecture

1. Frontend: HTML, CSS, JavaScript and Nginx
2. Backend: Node.js, Express.js and REST API
3. Database: MySQL

AWS Services Used

* Amazon EC2
* AWS Systems Manager (Session Manager)
* Security Groups
* Nginx

Features

* Add new students
* View all students
* Update student details
* Delete students
* Store student records in MySQL

Project Structure

aws-three-tier-student-management-system/
├── frontend/
│   ├── index.html
│   └── students.html
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   └── .gitignore
├── database/
│   └── schema.sql
└── README.md

Backend Setup

cd backend
npm install

Configure database credentials in a local .env file using .env.example as a reference.

Start the backend:

npm start

API Endpoints

Method	Endpoint	Description
GET	/students	Fetch all students
POST	/students	Add a student
PUT	/students/:id	Update a student
DELETE	/students/:id	Delete a student

Database Setup

Execute database/schema.sql in MySQL to create the database and students table.

Security

* MySQL is not publicly exposed.
* Backend access is restricted through AWS Security Groups.
* Database credentials are stored in environment variables.
* Sensitive files are excluded using .gitignore.

Author

Tushar Verma
