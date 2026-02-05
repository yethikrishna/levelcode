# NPM Publishing Setup Guide

This guide helps you set up NPM publishing for LevelCode packages.

## Step 1: Create NPM Account

1. Go to [npmjs.com/signup](https://www.npmjs.com/signup)
2. Create an account with:
   - Username: `yethikrishna` (or your preferred username)
   - Email: `yethikrishnarcvn7a@gmail.com`
   - Password: (create a secure password)

## Step 2: Login to NPM CLI

```bash
npm login
```

Enter your credentials when prompted.

## Step 3: Create an Access Token

1. Go to [npmjs.com/settings/tokens](https://www.npmjs.com/settings/~/tokens)
2. Click "Generate New Token"
3. Select "Classic Token"
4. Choose "Automation" type (for CI/CD)
5. Copy the token (starts with `npm_`)

**Important:** Save this token securely - you can only see it once!

## Step 4: Add Token to GitHub Secrets

1. Go to your repo: https://github.com/yethikrishna/levelcode/settings/secrets/actions
2. Click "New repository secret"
3. Name: `NPM_TOKEN`
4. Value: (paste your npm token)
5. Click "Add secret"

## Step 5: Add GitHub Token

For workflows that need elevated permissions:

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (full control)
   - `workflow`
   - `write:packages`
4. Copy the token
5. Add to repository secrets as `LEVELCODE_GITHUB_TOKEN`

## Step 6: Create NPM Organization (Optional)

To publish as `@levelcode/cli` and `@levelcode/sdk`:

1. Go to [npmjs.com/org/create](https://www.npmjs.com/org/create)
2. Organization name: `levelcode`
3. This allows scoped packages like `@levelcode/cli`

## Verify Setup

```bash
# Check login
npm whoami

# Test publish (dry run)
cd sdk
npm publish --dry-run
```

## Package Configuration

The packages are already configured for publishing:

- `@levelcode/cli` - CLI package
- `@levelcode/sdk` - SDK package

Both have `"private": false` or will be updated for publishing.
