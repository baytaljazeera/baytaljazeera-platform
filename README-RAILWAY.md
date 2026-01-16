# Railway Deployment Checklist

## 🔍 Troubleshooting Admin Login Issues

### 1. Check Environment Variables in Railway

Go to: **Railway Dashboard → Service → Variables**

**Required Variables:**
- ✅ `DATABASE_URL` - Your PostgreSQL connection string
- ✅ `JWT_SECRET` - **CRITICAL** - A random secret key (generate with: `openssl rand -base64 32`)
- ✅ `SESSION_SECRET` - A random secret key

**Optional Variables:**
- `UPSTASH_REDIS_URL` - Redis connection (optional)
- `REDIS_URL` - Alternative Redis connection (optional)
- `PORT` - Server port (Railway sets this automatically)

### 2. Check Logs in Railway

Go to: **Railway Dashboard → Service → Deployments → Latest → View Logs**

Look for these messages:
- ✅ `✅ Admin created: super@aqar.sa`
- ✅ `✅ Default countries inserted`
- ✅ `✅ Default cities inserted`
- ❌ `❌ JWT_SECRET is not set!` (if you see this, add JWT_SECRET)

### 3. Test Login

**Admin Credentials:**
- Email: `super@aqar.sa`
- Password: `Admin@123456`

### 4. Common Issues

#### Issue: "خطأ في السيرفر" (500 error)
**Solution:** Check if `JWT_SECRET` is set in Railway Variables

#### Issue: "بيانات الدخول غير صحيحة" (401 error)
**Solution:** 
- Verify admin user exists (check logs)
- Try: `admin@aqar.sa` / `Admin@123456`

#### Issue: "خطأ في الاتصال بقاعدة البيانات"
**Solution:** Check `DATABASE_URL` in Railway Variables

### 5. Manual Scripts (if needed)

If you have SSH access or Railway CLI:
```bash
# Check configuration
node backend/scripts/check-config.js

# Create/reset admin
node backend/scripts/create-admin.js

# Ensure plans exist
node backend/scripts/ensure-plans.js
```

## 📝 Quick Fixes

1. **Missing JWT_SECRET:**
   ```bash
   # Generate a secure JWT_SECRET
   openssl rand -base64 32
   ```
   Then add it to Railway Variables

2. **Restart Service:**
   - Railway Dashboard → Service → ... → Restart

3. **Redeploy:**
   - Railway Dashboard → Deployments → Latest → ... → Redeploy
