# PlayQR

PlayQR finds real apps on Google Play and creates QR codes that open the selected app's direct store listing.

## Live website

[eyuad.github.io/playqr](https://eyuad.github.io/playqr/)

## How it works

1. Enter an app name, optionally including its developer.
2. Choose the correct app from the Google Play matches.
3. Scan or download the generated QR code.

You can also paste a direct Google Play app link to generate its QR code immediately.

## Project structure

- `index.html` contains the responsive website and QR interface.
- `worker/worker.js` provides the Google Play search endpoint.
- `worker/wrangler.jsonc` contains the Cloudflare Worker configuration.

## Author

Built by [Euael Adane](https://github.com/EyuAd).

