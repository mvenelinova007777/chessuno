# ChessUno — the only guide you need

Everything below is **free** and there is **exactly one choice** at every step.
Do the steps in order. Total time: about 20 minutes (plus waiting for one build).

You will need:

- The project folder: `C:\Users\maria\Desktop\code` (it is already on your computer)
- A free GitHub account (step 4)
- A free Render account (step 6) — no credit card

---

## Step 1 — Install Node.js (one download)

1. Open **https://nodejs.org**
2. Click the big green button that says **LTS** (it will say something like "22.x.x LTS").
3. Open the downloaded file (it is in your **Downloads** folder).
4. Click **Next → Next → Next → Install → Finish**. Do not change any checkbox.

That is the only thing you need to download.

**Check it worked:** click the Start button, type `cmd`, press Enter. A black window
opens. Type this and press Enter:

```
node -v
```

If you see something like `v22.11.0`, you are done. Close the black window.

---

## Step 2 — Install the game's files (one command)

1. Open **File Explorer** and go to `C:\Users\maria\Desktop\code`
2. Click once in the address bar at the top (where the path is written).
3. Type `cmd` and press **Enter**. A black window opens *in that folder*.

Type this and press Enter:

```
npm install
```

Wait until it says something like `added 90 packages` and you get the prompt back.
This downloads the three libraries the game uses. You only do this once.

---

## Step 3 — Play it on your own computer first

In that same black window, type:

```
npm start
```

You will see `ChessUno listening on http://localhost:3000`. Leave the window open.

1. Open your browser and go to **http://localhost:3000**
2. Create a room, copy the code.
3. Open a **second tab** (Ctrl+T) and go to **http://localhost:3000** again.
4. Type the code, click **Join room**, and play.

To stop the server: click the black window and press **Ctrl+C**.

> If Windows asks about a firewall, click **Allow access**.

---

## Step 4 — Put the code on GitHub (no command line)

1. Go to **https://github.com** → **Sign up** (free) and confirm your email.
2. Go to **https://desktop.github.com** → **Download for Windows** → install it.
3. Open **GitHub Desktop** → **Sign in to GitHub.com** and log in with the account from point 1.
4. In GitHub Desktop: **File → Add local repository…**
5. Click **Choose…**, select `C:\Users\maria\Desktop\code`, then click **Add repository**.
6. Top right it says **Publish repository**. Click it.
   - Name: `chessuno`
   - **Untick** "Keep this code private" (Render's free plan needs a public repo)
   - Click **Publish repository**.

Your code is now online. You never need the command line for this step.

> If GitHub Desktop shows a long list of files, that is fine — `node_modules`
> is ignored automatically by the `.gitignore` file in the project.

---

## Step 5 — (optional) keep GitHub Desktop updated

Whenever you change the code later: open GitHub Desktop, type a short summary in
the bottom-left box, click **Commit to main**, then **Push origin**. Done.

---

## Step 6 — Put the game on the internet (Render, free)

1. Go to **https://render.com** → **Get Started** → **GitHub** → log in → **Authorize Render**.
   No credit card is required.
2. Click **New +** (top right) → **Web Service**.
3. Under "Git Provider", find **chessuno** and click **Connect**.
4. Fill the form with exactly these values:

| Field | Value |
| --- | --- |
| **Name** | `chessuno` (your link will be `chessuno.onrender.com`) |
| **Language** | `Node` |
| **Branch** | `main` |
| **Root Directory** | *(leave empty)* |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

5. Leave everything else as it is. Click **Deploy Web Service**.
6. Wait for the log to say `ChessUno listening on http://localhost:10000` and for
   the status to turn **Live** (2–4 minutes the first time).

Your game is now at **https://chessuno.onrender.com** (or whatever name you chose).
Send that link to your friend. Click **Create room** and send them the 5-letter code,
or click **Copy invite link** and send the link directly.

**The free-plan catch, honestly:** Render puts a free service to sleep after
15 minutes without any traffic, and waking it up takes about a minute. The first
person to open the link waits ~60 seconds. After that it is fast, and while you are
playing (even just sitting in a room, because the WebSocket connection sends
traffic) it stays awake. There is no way to avoid the first cold start for free;
just warn your friend that the first click may take a minute.

Free plan limits: 750 instance-hours per month, 512 MB RAM, 5 GB bandwidth — plenty
for two players.

---

## Step 7 — Play with your friend

1. Open **https://chessuno.onrender.com**
2. Type a nickname (or click **Random**)
3. Click **Create room**
4. Click **Copy invite link** and send it to your friend (WhatsApp, Messenger, anywhere)
5. Your friend opens the link, types a nickname, clicks **Join room** — the game starts
   immediately

If someone's connection drops, the game pauses for 60 seconds. Reopen the same link
on the same device and you continue where you left off. After 60 seconds the player
who is still online wins.

---

## Step 8 — Custom domain later (optional, still free-ish)

1. Buy a cheap domain (Namecheap/Cloudflare, ~10 €/year) — the domain itself is not free.
2. In Render: open your service → **Settings → Custom Domains → Add Custom Domain**.
3. Type `chessuno.yourdomain.com`, click **Save**.
4. Render shows a CNAME record. Copy it into your domain provider's DNS settings.
5. Wait a few minutes. Render issues the HTTPS certificate automatically.

You do not need this to play. The `*.onrender.com` address is already a real URL.

---

## If something goes wrong

| What you see | What to do |
| --- | --- |
| `node: command not found` / `'node' is not recognized` | Node.js is not installed. Redo Step 1, then **close and reopen** the black window. |
| `npm ERR!` during `npm install` | Check you are in `C:\Users\maria\Desktop\code` (the address bar trick in Step 2). |
| The page does not load on `localhost:3000` | Look at the black window: is it still running? Is the port already in use? Close the window, open it again, run `npm start`. |
| Render says "Deploy failed" | Open the log. `Cannot find module 'express'` means the build command is not `npm install`. |
| The site takes a minute to open | Normal on the free plan. It is waking up. |
| "That room does not exist" | Rooms are in memory only. If the server went to sleep and restarted, old rooms are gone — create a new one. |
| Two tabs on the same browser do not work | They do, but the reconnect token is per browser. For a realistic test use one normal window and one private/incognito window. |

---

## What to keep secret / what not to

- There are **no API keys, no passwords, no database** in this project. Nothing to configure.
- The repo being public is fine: it contains only game code.
- No personal data is stored on the server. Nicknames live in memory and disappear
  with the room. The browser stores only a reconnect token, your nickname and your
  language/sound choices in `localStorage`.
