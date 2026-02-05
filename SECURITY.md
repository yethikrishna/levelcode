# Security Policy

## Reporting Security Issues

If you believe you have found a security vulnerability in LevelCode, we encourage you to let us know right away. We will investigate all legitimate reports and do our best to quickly fix the problem.

**Email us at:** `yethikrishnarcvn7a@gmail.com`

Please include the following information in your report:
- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting)
- Full paths of source file(s) related to the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

Please do not report security vulnerabilities through public GitHub issues.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Security Best Practices

When using LevelCode:

1. **API Keys**: Never commit API keys to version control. Use environment variables or `.env` files (add to `.gitignore`).

2. **File Access**: LevelCode respects `.gitignore` patterns and `.levelcodeignore` for sensitive files.

3. **Command Execution**: Review any shell commands before allowing execution.

4. **Model Selection**: Use trusted models from reputable providers via OpenRouter.
