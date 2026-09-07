# Link-access media gallery

The Instagram kit has PC/mobile and actual/drawn variants, videos, GIFs, stills,
automatic demos and ZIP downloads. Example documents and scores are synthetic.

The drawn demo has two composition tabs: the existing full card and the
execution screen alone. Both PC/mobile versions include separate MP4, GIF and
three scene PNG files, plus variant/device/all-media ZIP downloads. The selected
composition persists in the `view=card|screen` URL query parameter. Download links
use `download=1` for an attachment response and descriptive filenames.

`private-media.bundle` is an AES-256-GCM encrypted gzip JSON file manifest, with
header `GPM1`, a 12-byte IV, 16-byte authentication tag, then ciphertext. The
public repository contains neither plaintext media nor its access URL/key.

Production `MEDIA_SHARE_SECRET` is a sensitive, 64-character lowercase hex key.
The final build step decrypts the bundle into `dist/share/<capability>/`, where
the capability is the first 40 hex characters of HMAC-SHA256(key,
`instagram-kit-v1`). Open `index.html` within that directory. All resources and
downloads remain beneath it. Missing keys omit the gallery; incorrect keys fail
the build. Never print the key, publish it to runtime config, or add the private
path to navigation, manifests, analytics or sitemaps.

This is an unlisted capability link, not identity authentication. Anyone holding
or receiving a forwarded URL can open it. Share responses use noindex/nofollow,
no-referrer and private/no-store. Those headers supplement the unguessable URL.
To revoke a link, remove the environment key and redeploy (also remove any old
deployments with publicly accessible copies). To rotate it, re-encrypt the
original media with a fresh key, replace the environment key and redeploy.
