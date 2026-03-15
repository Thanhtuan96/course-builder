# Deployment Guide

This document outlines the steps to deploy the Professor Web UI to Vercel.

## Prerequisites

- A Vercel account (sign up at [vercel.com](https://vercel.com))
- GitHub repository with the project code
- Supabase project (for data persistence)

## Vercel Project Setup

### 1. Import Project

1. Log in to Vercel at [vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Configure the following settings:
   - **Framework Preset:** Other
   - **Build Command:** `npm run build` (already configured in vercel.json)
   - **Output Directory:** Leave empty (not used with Node.js runtime)
   - **Install Command:** `npm install && cd web/client && npm install` (already configured in vercel.json)

### 2. Environment Variables

Configure the following environment variables in Vercel Dashboard → Project → Settings → Environment Variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | `https://xxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anonymous key (public) | `eyJhbGciOiJIUzI1NiIs...` |
| `SUPABASE_SERVICE_KEY` | Supabase service key (secret) | `eyJhbGciOiJIUzI1NiIs...` |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port (Vercel provides this) | `3000` |

**Note:** For staging/development environments, create separate values with `NODE_ENV=staging` or `NODE_ENV=development`.

### 3. Deploy

Once configured, Vercel will automatically deploy on every push to the main branch.

- **Production URL:** `https://your-project.vercel.app`
- **Custom Domain:** See "Custom Domain Configuration" below

## GitHub Integration

Vercel automatically integrates with GitHub for continuous deployment:

1. Push changes to your repository
2. Vercel detects the changes automatically
3. Build runs with the configured build command
4. Deployment goes live on success

### Branch-based Deployments

- **main branch:** Deploys to production
- **develop branch:** Deploys to staging (configure in Vercel Dashboard → Git → Deploy Hooks)

## Custom Domain Configuration

### 1. Add Domain

1. Go to Vercel Dashboard → Project → Settings → Domains
2. Enter your custom domain (e.g., `professor.yourdomain.com`)
3. Click "Add"

### 2. Configure DNS

Vercel will provide DNS records to configure:

| Type | Name | Value |
|------|------|-------|
| CNAME | www | cname.vercel-dns.com |
| A | @ | 76.76.21.21 |

### 3. SSL Certificate

Vercel automatically provisions and renews SSL certificates for custom domains. No additional configuration needed.

## Environment Configuration

### Production Environment

- **When:** Code pushed to `main` branch
- **NODE_ENV:** `production`
- **URL:** `https://your-project.vercel.app`

### Staging Environment

- **When:** Code pushed to `develop` branch
- **NODE_ENV:** `staging`
- **URL:** Available in Vercel Dashboard

### Preview Deployments

- **When:** Pull requests opened
- **Purpose:** Test changes before merging
- **URL:** Automatically generated (e.g., `https://project-name-abc123.vercel.app`)

## Troubleshooting

### Build Failures

1. Check Vercel Dashboard → Deployments → Failed deployment
2. Common issues:
   - Missing dependencies → Verify `npm install` completes
   - Environment variables missing → Check Environment Variables settings
   - Build command error → Check `vercel.json` configuration

### Runtime Errors

1. Check Vercel Dashboard → Functions → Function Logs
2. Common issues:
   - `SUPABASE_URL is undefined` → Verify environment variable is set
   - `Port already in use` → Ensure using `process.env.PORT`
   - Module not found → Check npm dependencies

### Custom Domain Issues

1. Verify DNS records are correct
2. Allow up to 24 hours for DNS propagation
3. Check Vercel Dashboard → Domains for status

## Supabase Setup

### 1. Create Project

1. Log in to [Supabase](https://supabase.com)
2. Create a new project
3. Note the project URL and keys

### 2. Get Credentials

1. Go to Project Settings → API
2. Copy `Project URL` → `SUPABASE_URL`
3. Copy `anon public` key → `SUPABASE_ANON_KEY`
4. Copy `service_role` key → `SUPABASE_SERVICE_KEY` (keep secret!)

### 3. Add to Vercel

Add these values to Vercel Dashboard → Project → Settings → Environment Variables.

---

*Last updated: 2026-03-15*
