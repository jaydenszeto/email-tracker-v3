# MongoDB Atlas Setup Guide

## Quick Setup (5 minutes)

### 1. Create MongoDB Atlas Account
1. Go to https://www.mongodb.com/cloud/atlas/register
2. Sign up (free, no credit card needed)
3. Click "Build a Database"
4. Choose **M0 FREE** tier
5. Select a cloud provider and region (any works)
6. Click "Create Cluster"

### 2. Create Database User
1. Click "Database Access" in left sidebar
2. Click "Add New Database User"
3. Choose "Password" authentication
4. Username: `emailtracker` (or anything you want)
5. Password: Click "Autogenerate Secure Password" and **SAVE IT**
6. Database User Privileges: "Read and write to any database"
7. Click "Add User"

### 3. Allow Network Access
1. Click "Network Access" in left sidebar
2. Click "Add IP Address"
3. Click "Allow Access from Anywhere" (0.0.0.0/0)
4. Click "Confirm"

### 4. Get Connection String
1. Click "Database" in left sidebar
2. Click "Connect" on your cluster
3. Click "Connect your application"
4. Copy the connection string (looks like):
   ```
   mongodb+srv://emailtracker:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. **Replace `<password>` with your actual password**

### 5. Add to Render
1. Go to your Render dashboard
2. Click on your web service
3. Go to "Environment" tab
4. Click "Add Environment Variable"
5. Key: `MONGODB_URI`
6. Value: Your connection string (with password replaced)
7. Click "Save Changes"

**Your service will automatically redeploy with MongoDB!**

---

## Testing Locally (Optional)

If you want to test locally before deploying:

1. Install dependencies:
   ```bash
   cd email-tracker-v3
   npm install
   ```

2. Create a `.env` file:
   ```
   MONGODB_URI=mongodb+srv://emailtracker:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   PORT=3000
   ```

3. Run:
   ```bash
   npm start
   ```

---

## What Changed?

- ✅ Replaced `tracking-data.json` with MongoDB
- ✅ All data now persists forever (512MB free storage)
- ✅ Same API endpoints, same functionality
- ✅ Each user's data isolated by API key
- ✅ No more data loss on Render restarts

## Troubleshooting

**"MongooseError: username and password must be escaped"**
- Your password has special characters that need encoding
- Go to https://www.urlencoder.org/
- Encode your password, use the encoded version in connection string

**"MongooseError: connect ECONNREFUSED"**
- Check that you replaced `<password>` in connection string
- Verify Network Access allows 0.0.0.0/0
- Wait 2-3 minutes after creating cluster

**"Connection timeout"**
- Your cluster is still spinning up (wait 2 minutes)
- Check Network Access settings
