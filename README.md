# Email Tracker

An intelligent email tracking system that monitors when emails are opened using invisible tracking pixels. The system provides accurate tracking by filtering out automated requests and bot activity, ensuring you only see genuine recipient opens.

## Features

**Accurate Open Tracking**
The system tracks real email opens while intelligently filtering out noise from email client prefetchers, image proxies, and automated bots. Only genuine opens are counted and displayed.

**Intelligent Bot Detection**
Automatically identifies and filters out automated fetches from:

- Gmail image proxy requests
- Yahoo mail proxy requests
- Email client prefetchers
- Search engine crawlers
- Preview and pre-render requests

**Real-Time Dashboard**
View all tracked emails in a clean, auto-refreshing dashboard that displays:

- Email subject and recipient
- Total open count
- Last opened timestamp
- Detailed open events with device information
- IP addresses and user agent details

<img width="1512" height="844" alt="image" src="https://github.com/user-attachments/assets/97b50a87-f90c-49c1-8490-a1c9209e65e3" />

**Chrome Extension Integration**
The optional Chrome extension automatically adds tracking pixels to your Gmail compose window. Simply focus the message body and the extension handles the rest, adding an invisible 1x1 pixel that reports when the recipient opens the email.

**API Key Authentication**
Secure access to your tracking data through unique API keys. Generate keys directly from the dashboard or extension, with full control over your tracking data.

## How the Chrome Extension Works

The Chrome extension provides seamless integration with Gmail to automatically track your outgoing emails:

**Inbox Indicators**: The extension also adds visual indicators directly in your Gmail inbox, showing checkmarks next to sent emails that have been tracked. Green checkmarks indicate opened emails with open counts, while gray checkmarks show tracked emails that haven't been opened yet.

<img width="1057" height="41" alt="image" src="https://github.com/user-attachments/assets/99031694-6fd5-49c2-8902-0d18767f922c" />

All of this happens automatically in the background. You can enable or disable auto-tracking in the extension settings at any time.

## Deploying to Render

Follow these steps to deploy your email tracker to Render:

**Step 1: Set Up MongoDB**

1. Create a free MongoDB Atlas account at mongodb.com/cloud/atlas
2. Create a new cluster (the free tier works well)
3. Create a database user with a password
4. Whitelist all IP addresses (0.0.0.0/0) in Network Access
5. Get your connection string (it should look like: mongodb+srv://username:password@cluster.mongodb.net/email-tracker)

**Step 2: Push Code to GitHub**

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

**Step 3: Deploy on Render**

1. Go to render.com and sign in with your GitHub account
2. Click "New +" and select "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - Name: email-tracker (or your preferred name)
   - Environment: Node
   - Build Command: npm install
   - Start Command: npm start
   - Plan: Free (or paid for better performance)

**Step 4: Add Environment Variable**

1. In the Render dashboard, go to the "Environment" tab
2. Add a new environment variable:
   - Key: MONGODB_URI
   - Value: Your MongoDB connection string from Step 1
3. Save changes

**Step 5: Deploy**
Click "Create Web Service" and Render will automatically build and deploy your application. The deployment URL will be something like: https://email-tracker-xxxx.onrender.com

**Important Notes:**

- The free tier may spin down after 15 minutes of inactivity and take 30-50 seconds to wake up on the next request
- Make sure to update your Chrome extension settings with your new Render URL
- For production use, consider upgrading to a paid Render plan for better performance and uptime
- Your MongoDB connection string contains sensitive credentials - never commit it to your repository

**Testing Your Deployment:**

1. Visit your Render URL in a browser
2. Generate a new API key from the dashboard
3. Create a test tracking link
4. Send a test email with the tracking pixel
5. Check the dashboard to verify the email appears and opens are tracked correctly
