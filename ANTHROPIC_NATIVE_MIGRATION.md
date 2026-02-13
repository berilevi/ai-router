# Anthropic Native SDK Migration

## Summary

Successfully migrated the Anthropic provider from OpenAI-compatible wrapper mode to **native Anthropic SDK exclusively**. The provider now uses `@anthropic-ai/sdk` directly for all Anthropic API interactions.

## Changes Made

### 1. Configuration (`src/utils/config.ts`)
- **Removed**: `ANTHROPIC_PROVIDER_MODE` environment variable and related parsing logic
- **Simplified**: `anthropicConfig` to always use `'native'` mode
- **Updated**: Anthropic provider config to make `baseUrl` optional (SDK defaults to `https://api.anthropic.com`)

### 2. Provider Factory (`src/providers/index.ts`)
- **Removed**: `createAnthropicProvider()` method that handled mode selection
- **Removed**: Import of `anthropicConfig` (no longer needed)
- **Simplified**: `createProvider()` to always instantiate `AnthropicProvider` for type `'anthropic'`

### 3. Environment Configuration (`.env.example`)
- **Removed**: `ANTHROPIC_PROVIDER_MODE` variable and its documentation
- **Removed**: References to "OpenAI-compatible" wrapper mode
- **Updated**: Comments to reflect native SDK usage
- **Clarified**: `ANTHROPIC_BASE_URL` is optional

### 4. Documentation (`README.md`)
- **Updated**: Provider table to show Anthropic as "Native SDK" only
- **Removed**: "Anthropic (Compatible)" row from providers table
- **Removed**: `ANTHROPIC_PROVIDER_MODE` configuration examples
- **Simplified**: Anthropic provider section to focus on native features
- **Updated**: Test coverage descriptions to remove mode selection references

### 5. Project Context (`CLAUDE_PROJECT.md`)
- **Marked**: Issue #8 as ✅ FIXED
- **Updated**: Environment variables section
- **Updated**: Areas for improvement (removed "Native Anthropic API support")
- **Added**: Migration to bug fixes list
- **Updated**: "Remaining Issues" section

## Benefits

1. **Simpler Configuration**: No need to choose provider mode - it just works
2. **Better Compatibility**: Native SDK ensures full feature support
3. **Reduced Complexity**: Removed unnecessary abstraction layer
4. **Clearer Intent**: Code is more explicit about using Anthropic's official SDK
5. **Easier Maintenance**: One less configuration option to test and support

## Existing Native Features (Already Implemented)

The `AnthropicProvider` class (`src/providers/anthropic.ts`) already had excellent native support:

- ✅ Native Anthropic Messages API integration
- ✅ Automatic system message extraction (Anthropic-specific requirement)
- ✅ Vision/image support with automatic MIME type detection (JPEG, PNG, GIF, WebP)
- ✅ Tool/function calling with OpenAI → Anthropic format conversion
- ✅ Streaming with proper token usage tracking
- ✅ Multi-turn conversations with tool results
- ✅ Error handling and recovery

## Migration Path for Users

### Before (with mode selection):
```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
ANTHROPIC_PROVIDER_MODE=auto
```

### After (native only):
```env
ANTHROPIC_API_KEY=sk-ant-...
# Optional: Custom base URL (defaults to https://api.anthropic.com)
ANTHROPIC_BASE_URL=
```

**Note**: Users can simply remove `ANTHROPIC_PROVIDER_MODE` from their `.env` files. The provider will automatically use native mode.

## Testing

- ✅ TypeScript compilation successful (`npm run build`)
- ✅ No breaking changes to public APIs
- ✅ Existing tests should continue to pass (uses native provider)

## Files Modified

1. `src/utils/config.ts` - Removed mode selection logic
2. `src/providers/index.ts` - Simplified provider instantiation
3. `.env.example` - Updated documentation
4. `README.md` - Updated documentation
5. `CLAUDE_PROJECT.md` - Updated project status
6. `ANTHROPIC_NATIVE_MIGRATION.md` - This file

## Backward Compatibility

⚠️ **Breaking Change**: The `ANTHROPIC_PROVIDER_MODE` environment variable is no longer supported.

**Migration**: Simply remove this variable from your `.env` file. The native provider will be used automatically.

## Conclusion

This migration simplifies the codebase while ensuring the best possible integration with Anthropic's API. The native SDK is now the only option, eliminating confusion and reducing maintenance burden.
