# FormCraft

A form builder website: create a form, give it a look, share the link, collect responses,
filter them with SQL and allocate limited seats to eligible people.

Built with **HTML, CSS, JavaScript** (frontend), **Node.js** (backend) and **SQL / SQLite** (database).
No extra packages are needed.

## How to run

1. Install Node.js 22.13 or newer.
2. Open a terminal in this `formcraft` folder.
3. Run:

   ```bash
   node server.js
   ```

4. Open http://localhost:3000 in the browser.

The database file is created automatically at `data/formcraft.db`, and uploaded files are kept in `data/uploads`.
To start fresh, stop the server and delete the `data` folder.

## Settings

All settings are environment variables; none are needed to run locally.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `DATA_DIR` | `./data` | Folder for the database and uploaded files. On a host, set it to a permanent disk |
| `TRUST_PROXY` | off | Set to `1` behind a hosting proxy so rate limits see the visitor's real IP |
| `DEMO_MODE` | off | Set to `1` on hosting without a permanent disk; every page then shows that data can be reset |

`GET /healthz` answers `{"ok":true}` when the server and database work; hosts use it as a health check.

## Putting it online

The site keeps its data in files, so the host **must give it a permanent disk**. Hosts that wipe files
on every restart (most free plans) would delete every account, form and response.

### Option A: Render (simplest)

1. Put the contents of this `formcraft` folder in a GitHub repository (the `data` folder must **not** be uploaded).
2. On render.com: *New* > *Blueprint*, pick the repository. Render reads `render.yaml` and creates the web service.
3. Wait for the deploy, then open the `https://….onrender.com` address it gives you.

`render.yaml` uses Render's **free** plan, which is fine for a demo but has no permanent disk:
every restart or new deploy deletes all data, and the site sleeps after 15 idle minutes.
`DEMO_MODE=1` makes every page say so. For real customers, follow the steps at the top of
`render.yaml` to switch to the paid **Starter** plan with a 1 GB disk at `/var/data`.

### Option B: any Docker host (Railway, Fly.io, a VPS)

Build the `Dockerfile` and mount a permanent volume at `/data`. The app listens on port 3000
(or `PORT` if the host sets it).

### After it is online

- Share links and QR codes use the public address automatically.
- Sign-up and login are limited to 20 tries per 15 minutes per visitor, and public forms to
  30 submissions or uploads per 10 minutes, to stop password guessing and spam.
- On https the login cookie is marked Secure.
- **Back up** `formcraft.db` and the `uploads` folder from the disk from time to time.
- The local test data on this computer is not uploaded; the online site starts empty.

## Features

**Accounts** — sign up, log in, log out. Passwords are stored as scrypt hashes; a login lasts 7 days.

**Builder**
- 10 question types: short text, long text, email, number, date, dropdown, single choice, multiple choice, file upload and page break
- Required questions, reordering, and "show only if" conditions (a question appears only for a chosen answer)
- 15 colour themes, 19 moving backgrounds (bubbles, strawberries, stars, hearts, snow, confetti and more) and an uploaded background picture
- Open/close the form, a response limit and a custom thank-you message
- Share link and QR code
- 6 templates and duplicating forms

**Public form** — works without an account, splits into steps at page breaks, checks answers in the browser and again on the server, and accepts files up to 5 MB.

**Responses**
- Filters on every choice and number question, status and search; the SQL query behind the list is shown
- Seat allocation: the earliest eligible responses are selected, the rest go on a waiting list
- Change a status by hand, charts of the answers, CSV download and print

## Files

| File | What it does |
|---|---|
| `server.js` | Web server and JSON API |
| `db.js` | Opens the database and adds missing columns |
| `schema.sql` | The tables: users, sessions, forms, fields, responses, answers, uploads |
| `templates.js` | Ready-made forms |
| `public/*.html` | The pages |
| `public/css/style.css` | All styles and colour themes |
| `public/js/common.js` | Helpers shared by every page |
| `public/js/visuals.js` | Moving backgrounds |
| `public/js/builder.js` | The form builder |
| `public/js/form.js` | The public form |
| `public/js/responses.js` | Responses, filters and seat allocation |
