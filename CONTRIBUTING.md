# Contributing to AIRA

Thank you for your interest in contributing to the Autonomous Incident Recovery Agent! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and professional
- Welcome diverse perspectives and experiences
- Focus on constructive feedback
- Resolve disputes amicably

## Getting Started

### 1. Understand the Project

Before making changes:
- Read [README.md](README.md) - High-level overview
- Read [ARCHITECTURE.md](ARCHITECTURE.md) - How the system works (20 min)
- Review project structure: `backend/services/`, `backend/agents/`

### 2. Set Up Development Environment

```bash
# Clone and setup (see Quick Start in README.md)
git clone https://github.com/JSuhas123/Autonomous-Incident-Recovery-Agent-AIRA-system.git
cd backend
npm install

# Start infrastructure
docker-compose up -d

# Verify setup
npm test
```

### 3. Create Your Feature Branch

```bash
git checkout -b feature/descriptive-name
# or
git checkout -b fix/issue-description

# Examples:
# feature/add-pagerduty-integration
# fix/auth-middleware-crypto-bug
# docs/improve-deployment-guide
```

## Development Workflow

### Writing Code

#### Code Style
- Use ESLint: `npm run lint`
- Format code: `npm run format`
- Follow existing patterns in codebase

#### File Organization
- Services go in `backend/services/`
- Models go in `backend/models/`
- Middleware in `backend/middleware/`
- Routes in `backend/routes/`
- Tests alongside source code (`.test.js` files)

#### Documentation
- Add JSDoc comments for functions
- Update relevant .md files if changing behavior
- Include usage examples in docstrings

### Writing Tests

**All new code must include tests.**

```bash
# Run tests for specific file
npm test -- authMiddleware.test.js

# Run all unit tests
npm test -- --testPathPattern=unit

# Generate coverage report
npm run coverage
```

**Test structure**:
```javascript
describe('ComponentName', () => {
  describe('Happy path', () => {
    it('should do something correctly', () => {
      // Arrange
      // Act
      // Assert
    });
  });

  describe('Error cases', () => {
    it('should handle error gracefully', () => {
      // Test error handling
    });
  });
});
```

### Chaos Testing

For changes to critical paths (decision making, action execution, safety gates):

```bash
cd backend/chaos
npm test
node quick-start.js      # Validate environment
node run-chaos-tests.js  # Run failure scenarios
```

This validates your code handles failures correctly.

### Before Committing

```bash
# Format code
npm run format

# Lint check
npm run lint

# Run all tests
npm test

# Check coverage (should maintain or increase)
npm run coverage

# Run chaos tests (if touching critical code)
cd chaos && node run-chaos-tests.js
```

## Commit Guidelines

### Commit Messages

Use clear, descriptive commit messages:

```
fix: auth middleware constant-time comparison

- Add crypto.timingSafeEqual for signature verification
- Normalize buffer lengths before comparison
- Add test cases for edge cases

Fixes #123
```

Format:
```
<type>: <subject>
<blank line>
<body>
<blank line>
<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions/changes
- `refactor`: Code refactoring without behavior change
- `perf`: Performance improvements
- `chore`: Build, dependency updates, etc.

### Commit Best Practices

- **Small commits**: One logical change per commit
- **Atomic commits**: Commit should be independently useful
- **Clear messages**: Someone should understand the change from the message
- **Reference issues**: Use `Fixes #123` in footer to close related issues

## Submitting a Pull Request

### Before Submitting

1. **Check if base branch is correct**: Usually `main` or `develop`
2. **Pull latest changes**: `git pull origin main`
3. **Rebase if needed**: `git rebase origin/main`
4. **Run full test suite**: `npm test && npm run coverage`

### Create Pull Request

Use this template:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Chaos tests pass (if applicable)
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Comments/docs are clear and complete
- [ ] No new console.log statements
- [ ] Tests pass locally
- [ ] Coverage maintained or improved
- [ ] Related issues referenced

## Closes
Closes #123
```

### PR Checklist

Before marking PR as ready:

- [ ] **Builds**: `npm run build` succeeds (if applicable)
- [ ] **Tests Pass**: `npm test` shows all green
- [ ] **Coverage**: `npm run coverage` shows maintained/improved percentage
- [ ] **Lint**: `npm run lint` has no errors
- [ ] **Format**: `npm run format` makes no changes
- [ ] **Docs**: README, ARCHITECTURE, etc. updated if needed
- [ ] **Commit messages**: Clear and follow guidelines

## Code Review Process

- Maintainers will review your PR
- Feedback will be provided within 48 hours
- You may be asked for changes
- Once approved, PR will be merged

## What We Look For in Reviews

✅ **Do**:
- Fixes the stated issue or implements the feature
- Includes appropriate tests
- Updates documentation
- Maintains code style consistency
- Handles edge cases and errors

⚠️ **Watch out for**:
- Adding unnecessary dependencies
- Over-engineering solutions
- Insufficient test coverage
- Breaking existing functionality
- Large pull requests (prefer smaller, focused changes)

## Areas Welcome Contributions

### High Priority
- [ ] Bug fixes (see GitHub Issues marked as `bug`)
- [ ] Test coverage (see [TESTING.md](TESTING.md))
- [ ] Documentation improvements
- [ ] Performance optimizations

### Policy & Rules
- [ ] New runbook examples in `backend/runbooks/`
- [ ] Policy rules in `backend/policies/`
- [ ] Incident response scenarios

### Low Priority
- [ ] UI/Dashboard features (out of scope)
- [ ] New external integrations (keep it minimal)
- [ ] Large refactors (discuss first)

## Questions or Need Help?

- **GitHub Discussions**: Create a discussion for questions
- **GitHub Issues**: Create an issue with `question` label
- **Code Review**: Ask questions in PR comments

## Recognition

Contributors will be:
- Acknowledged in CHANGELOG.md
- Listed in contributor list (if desired)
- Credited in commit history

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

---

**Thank you for contributing! Together we make incident response safer and faster.** 🚀
