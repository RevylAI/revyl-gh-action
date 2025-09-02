# Revyl GitHub Actions Examples

This folder contains complete, ready-to-use workflow examples that demonstrate
how to integrate Revyl Actions into your mobile CI/CD pipeline.

## 🚀 Quick Start

1. **Choose your example** based on your mobile framework
2. **Copy the workflow file** to `.github/workflows/` in your repository
3. **Update the configuration** (marked with 📝 comments)
4. **Set up secrets** in your GitHub repository
5. **Push and watch the magic happen!** ✨

## 📱 Available Examples

### [expo-ios-build.yml](./expo-ios-build.yml) - Expo iOS Build Pipeline

**Perfect for:** Expo/React Native iOS projects using EAS Build

**What it does:**

- 🍎 Builds iOS `.app` with Expo EAS (15-20 minutes)
- 📦 Automatically converts `.tar.gz` to `.zip` format
- ⬆️ Uploads to Revyl with automatic metadata injection
- 🧪 Optionally runs tests on the uploaded build
- 💬 Posts results to PR comments

**Key features:**

- **Zero manual configuration** - automatic CI/CD metadata
- **Smart version naming** - includes PR numbers and branch names
- **Comprehensive logging** - see exactly what's happening
- **Error handling** - clear error messages when things go wrong

### [react-native-android.yml](./react-native-android.yml) - React Native Android Pipeline

**Perfect for:** React Native Android projects building APKs

**What it does:**

- 🤖 Builds Android APK with Gradle (5-10 minutes)
- 📦 Extracts package ID from APK manifest
- ⬆️ Uploads to Revyl with automatic metadata injection
- 🧪 Optionally runs tests on the uploaded build
- 💬 Posts results to PR comments

**Key features:**

- **Gradle caching** - faster builds on subsequent runs
- **APK verification** - ensures build succeeded before upload
- **Size reporting** - shows APK size in results
- **Flexible paths** - works with custom Android project structures

### [multi-platform-matrix.yml](./multi-platform-matrix.yml) - Multi-Platform Build Matrix

**Perfect for:** Teams building both iOS and Android simultaneously

**What it does:**

- 🚀 Builds iOS and Android in parallel using GitHub matrix strategy
- ⬆️ Uploads both platforms to separate Revyl build variables
- 🧪 Runs platform-specific tests concurrently
- 📊 Provides unified results summary

**Key features:**

- **Parallel execution** - build both platforms at the same time
- **Matrix strategy** - easily add more platforms or configurations
- **Unified reporting** - see all results in one place
- **Efficient resource usage** - maximum CI/CD throughput

### [upload-only-expo.yml](./upload-only-expo.yml) - Simple Upload Only

**Perfect for:** Teams that want to store builds without automated testing

**What it does:**

- 🍎 Builds with Expo EAS
- ⬆️ Uploads to Revyl
- ✅ That's it! Clean and simple

**Key features:**

- **Minimal setup** - just the essentials
- **Fast execution** - no testing overhead
- **Perfect starting point** - add testing later when ready

## 🔧 Setup Instructions

### 1. Required Secrets

Add these to your GitHub repository secrets (`Settings` →
`Secrets and variables` → `Actions`):

| Secret          | Where to get it                                                              | Purpose                              |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| `REVYL_API_KEY` | [Revyl Settings](https://auth.revyl.ai/account/api_keys)                     | Authenticate with Revyl API          |
| `EXPO_TOKEN`    | [Expo Settings](https://expo.dev/accounts/[username]/settings/access-tokens) | Download builds from EAS (Expo only) |

### 2. Required Configuration

Update these values in your chosen workflow file:

```yaml
env:
  # 🏗️ REQUIRED: Get from Revyl dashboard when creating build variable
  BUILD_VAR_ID: 'your-build-variable-id-here'

  # 📱 OPTIONAL: Get from Revyl dashboard if you want to run tests
  TEST_ID: 'your-test-id-here'
```

### 3. Optional Customizations

**File paths:** Update if your project structure is different:

```yaml
# For Expo projects in subdirectories
working-directory: apps/my-expo-app

# For React Native with custom Android location
cache-dependency-path: android/package-lock.json
```

**Build profiles:** Customize for your EAS/Gradle setup:

```yaml
# Expo: Change build profile
eas build --platform ios --profile production

# Android: Change build type
./gradlew assembleDebug  # for debug builds
```

**Version naming:** Customize the version format:

```yaml
# Simple version with just run number
VERSION: v${{ github.run_number }}

# Include commit SHA
VERSION: ${{ github.sha }}-${{ github.run_number }}

# Custom format
VERSION: myapp-${{ github.ref_name }}-${{ github.run_number }}
```

## 📊 What You Get

### Automatic CI/CD Metadata

Every build uploaded includes rich metadata automatically:

```json
{
  "ci_run_url": "https://github.com/user/repo/actions/runs/123456",
  "commit_sha": "abc123def456",
  "branch": "feature/new-ui",
  "pr_number": "42",
  "ci_system": "github-actions",
  "ci_build_number": "123",
  "ci_build_attempt": "1"
}
```

### Rich GitHub Integration

- **📊 Step summaries** with build/test results
- **💬 PR comments** with success/failure status
- **🔗 Direct links** to Revyl test reports
- **⏱️ Timing information** for builds and tests
- **📱 Package information** extracted from builds

### Real-time Monitoring

Watch your tests execute live with:

- **🔄 Real-time progress updates** via Server-Sent Events
- **📝 Detailed step logging** for debugging
- **⏱️ Execution time tracking**
- **🎯 Current step information**

## 🛠️ Troubleshooting

### Common Issues

**❌ "Missing REVYL_API_KEY"**

- Add `REVYL_API_KEY` to your repository secrets
- Get it from: https://auth.revyl.ai/account/api_keys

**❌ "Build variable not found"**

- Update `BUILD_VAR_ID` in your workflow
- Create a build variable in your Revyl dashboard first

**❌ "Failed to get build URL from EAS"**

- Check your `EXPO_TOKEN` secret
- Verify your EAS build profile exists
- Make sure you have EAS credits available

**❌ "APK not found at expected location"**

- Check your Android project structure
- Update the `APK_PATH` if your build outputs to a different location
- Ensure Gradle build succeeded

**❌ "Expo URL download failed"**

- Verify `EXPO_TOKEN` has access to your builds
- Check that the build completed successfully in EAS
- Ensure build URL is accessible

### Debug Mode

Add this to any step for detailed debugging:

```yaml
- name: Debug Environment
  run: |
    echo "🔍 Environment Variables:"
    env | grep -E "(REVYL|EXPO|BUILD)" | sort
    echo "📁 File Structure:"
    find . -name "*.apk" -o -name "*.app" -o -name "*.tar.gz" | head -10
```

### Getting Help

- **📚 Documentation:** https://docs.revyl.ai/ci-recipes/github-actions
- **💬 Support:** Contact support through your Revyl dashboard
- **🐛 Issues:** Open an issue in this repository

## 🎯 Next Steps

1. **Start simple** - Copy an example and get it working
2. **Customize gradually** - Add your specific requirements
3. **Add more tests** - Create multiple test scenarios
4. **Set up workflows** - Use Revyl workflows for complex test suites
5. **Monitor and iterate** - Use the reports to improve your app

## 🏆 Pro Tips

**🚀 Speed up builds:**

- Use caching for dependencies and build artifacts
- Run builds only when necessary (path filters)
- Use matrix builds for multiple platforms

**🔒 Security best practices:**

- Never commit secrets to your repository
- Use environment-specific API keys
- Rotate tokens regularly

**📈 Scale your testing:**

- Create separate workflows for different environments
- Use Revyl workflows for comprehensive test suites
- Set up notifications for test failures

**🎨 Customize for your team:**

- Add Slack/Teams notifications
- Create custom PR comment formats
- Add deployment steps after successful tests

Ready to supercharge your mobile CI/CD? Choose an example above and get started!
🚀
