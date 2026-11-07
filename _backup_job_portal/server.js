const express = require("express");
const mysql = require("mysql2");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Default mock data for fallback
let fallbackJobs = [
    {
        jobid: 99,
        jobtitle: "Web Developer",
        company: "TCS",
        location: "Hyderabad",
        salary: 450000.00,
        skills: "Java, Spring Boot, MySQL",
        interviewdate: "2026-10-06",
        numberofposts: 2
    },
    {
        jobid: 102,
        jobtitle: "Software Engineer",
        company: "Infosys",
        location: "Chennai",
        salary: 550000.00,
        skills: "Python, Django, React",
        interviewdate: "2026-11-08",
        numberofposts: 5
    },
    {
        jobid: 105,
        jobtitle: "UI Designer",
        company: "Accenture",
        location: "Pune",
        salary: 480000.00,
        skills: "HTML, CSS, Figma",
        interviewdate: "2026-11-22",
        numberofposts: 3
    },
    {
        jobid: 1001,
        jobtitle: "Python Developer",
        company: "Amazon",
        location: "Bangalore",
        salary: 650000.00,
        skills: "Python, SQL, AWS",
        interviewdate: "2026-10-10",
        numberofposts: 8
    }
];

let useDatabase = false;
let db = null;

try {
    db = mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "niha123",
        database: "online_job_portal"
    });

    db.connect((err) => {
        if (err) {
            console.log("MySQL connection error, using in-memory data store:", err.message);
            useDatabase = false;
        } else {
            console.log("Connected to MySQL database 'online_job_portal'");
            useDatabase = true;
        }
    });
} catch (e) {
    console.log("MySQL initialization error:", e.message);
    useDatabase = false;
}

// Helper to format date as YYYY-MM-DD
function formatDate(d) {
    if (!d) return "";
    if (typeof d === "string") {
        return d.split("T")[0];
    }
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "";
    return dateObj.toISOString().split("T")[0];
}

// GET all jobs
app.get("/jobs", (req, res) => {
    if (useDatabase && db) {
        db.query("SELECT * FROM jobs ORDER BY jobid ASC", (err, result) => {
            if (err) {
                console.error("DB error on GET /jobs:", err.message);
                return res.json(fallbackJobs);
            }
            const formatted = result.map(j => ({
                ...j,
                interviewdate: formatDate(j.interviewdate)
            }));
            res.json(formatted);
        });
    } else {
        res.json(fallbackJobs);
    }
});

// GET single job
app.get("/jobs/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (useDatabase && db) {
        db.query("SELECT * FROM jobs WHERE jobid = ?", [id], (err, result) => {
            if (err) {
                console.error("DB error on GET /jobs/:id:", err.message);
                const found = fallbackJobs.filter(j => j.jobid == id);
                return res.json(found);
            }
            const formatted = result.map(j => ({
                ...j,
                interviewdate: formatDate(j.interviewdate)
            }));
            res.json(formatted);
        });
    } else {
        const found = fallbackJobs.filter(j => j.jobid == id);
        res.json(found);
    }
});

// POST insert job
app.post("/jobs", (req, res) => {
    const { jobid, jobtitle, company, location, salary, skills, interviewdate, numberofposts } = req.body;
    const formattedDate = formatDate(interviewdate);

    if (useDatabase && db) {
        const sql = "INSERT INTO jobs(jobid, jobtitle, company, location, salary, skills, interviewdate, numberofposts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        db.query(sql, [jobid, jobtitle, company, location, salary, skills, formattedDate || null, numberofposts], (err) => {
            if (err) {
                console.error("DB insert error:", err.message);
                // Also update fallback cache
                fallbackJobs.push({
                    jobid: parseInt(jobid, 10),
                    jobtitle,
                    company,
                    location,
                    salary: parseFloat(salary),
                    skills,
                    interviewdate: formattedDate,
                    numberofposts: parseInt(numberofposts, 10)
                });
                return res.status(500).send(err.message);
            }
            res.send("Job Inserted Successfully");
        });
    } else {
        fallbackJobs.push({
            jobid: parseInt(jobid, 10),
            jobtitle,
            company,
            location,
            salary: parseFloat(salary),
            skills,
            interviewdate: formattedDate,
            numberofposts: parseInt(numberofposts, 10)
        });
        res.send("Job Inserted Successfully");
    }
});

// PUT update job
app.put("/jobs/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { jobtitle, company, location, salary, skills, interviewdate, numberofposts } = req.body;
    const formattedDate = formatDate(interviewdate);

    if (useDatabase && db) {
        const sql = "UPDATE jobs SET jobtitle=?, company=?, location=?, salary=?, skills=?, interviewdate=?, numberofposts=? WHERE jobid=?";
        db.query(sql, [jobtitle, company, location, salary, skills, formattedDate || null, numberofposts, id], (err, result) => {
            if (err) {
                console.error("DB update error:", err.message);
                return res.status(500).send(err.message);
            }
            if (result.affectedRows === 0) {
                return res.status(404).send("Job NOT found");
            }
            res.send("Job Updated Successfully");
        });
    } else {
        const index = fallbackJobs.findIndex(j => j.jobid == id);
        if (index === -1) {
            return res.status(404).send("Job NOT found");
        }
        fallbackJobs[index] = {
            jobid: id,
            jobtitle,
            company,
            location,
            salary: parseFloat(salary),
            skills,
            interviewdate: formattedDate,
            numberofposts: parseInt(numberofposts, 10)
        };
        res.send("Job Updated Successfully");
    }
});

// DELETE job
app.delete("/jobs/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (useDatabase && db) {
        db.query("DELETE FROM jobs WHERE jobid = ?", [id], (err, result) => {
            if (err) {
                console.error("DB delete error:", err.message);
                return res.status(500).send(err.message);
            }
            if (result.affectedRows === 0) {
                return res.status(404).send("Job NOT found to delete");
            }
            res.send("Job Deleted Successfully");
        });
    } else {
        const initialLength = fallbackJobs.length;
        fallbackJobs = fallbackJobs.filter(j => j.jobid != id);
        if (fallbackJobs.length === initialLength) {
            return res.status(404).send("Job NOT found to delete");
        }
        res.send("Job Deleted Successfully");
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
