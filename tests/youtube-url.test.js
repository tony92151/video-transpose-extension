import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractYouTubeVideoId, isSupportedWatchUrl } from '../src/shared/youtube-url.js';

describe('YouTube URL helpers', () => {
  it('extracts video IDs from supported watch URLs', () => {
    assert.equal(
      extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'),
      'dQw4w9WgXcQ'
    );
    assert.equal(
      extractYouTubeVideoId('https://youtube.com/watch?feature=shared&v=abc_123-xyz'),
      'abc_123-xyz'
    );
  });

  it('rejects unsupported YouTube and non-YouTube URLs', () => {
    assert.equal(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), null);
    assert.equal(extractYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
    assert.equal(isSupportedWatchUrl('https://www.youtube.com/feed/subscriptions'), false);
  });

  it('identifies supported watch pages', () => {
    assert.equal(isSupportedWatchUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true);
    assert.equal(isSupportedWatchUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), false);
  });
});
