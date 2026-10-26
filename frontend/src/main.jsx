import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [applications, setApplications] = useState([]);
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadApplications() {
    setLoading(true);

    try {
      const response = await fetch("/api/applications");

      if (!response.ok) {
        throw new Error("Could not load applications.");
      }

      setApplications(await response.json());
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadApplications();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim(),
          job_title: jobTitle.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save application.");
      }

      setApplications((current) => [data, ...current]);
      setCompany("");
      setJobTitle("");
      setMessage("Application saved successfully.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{
      maxWidth: "900px",
      margin: "40px auto",
      padding: "24px",
      fontFamily: "Arial, sans-serif",
      color: "#172b4d"
    }}>
      <h1>Job Application Tracker</h1>
      <p>Keep your job applications organised in one place.</p>

      <form onSubmit={handleSubmit}>
        <p>
          <label htmlFor="company">Company</label>
          <br />
          <input
            id="company"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            maxLength={150}
            required
            style={{ padding: "10px", width: "90%" }}
          />
        </p>

        <p>
          <label htmlFor="job-title">Job title</label>
          <br />
          <input
            id="job-title"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
            maxLength={150}
            required
            style={{ padding: "10px", width: "90%" }}
          />
        </p>

        <button
          type="submit"
          disabled={saving || !company.trim() || !jobTitle.trim()}
          style={{ padding: "12px 20px" }}
        >
          {saving ? "Saving..." : "Add application"}
        </button>
      </form>

      <p role="status">{message}</p>

      <h2>Your applications ({applications.length})</h2>

      {loading ? (
        <p>Loading applications...</p>
      ) : applications.length === 0 ? (
        <p>No applications to display.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", textAlign: "left" }}>
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Job title</th>
                <th scope="col">Status</th>
                <th scope="col">Date applied</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.id}>
                  <td style={{ padding: "12px 0" }}>
                    {application.company}
                  </td>
                  <td>{application.job_title}</td>
                  <td>{application.status}</td>
                  <td>{application.applied_date.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);