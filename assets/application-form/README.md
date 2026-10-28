# Application Form template assets

- `title.png`: title and emoji only, cropped from the user-supplied Canva reference at 3× resolution. Contains no customer fields or document metadata.
- `CanvaSans-Regular.ttf`: static regular (weight 400) instance of Canva Sans, obtained from Canva's own font endpoint `https://static.canva.com/web/images/f93a5165fac252ecfd593929c4e6146f.woff`. Used to match the supplied reference's font. Original font naming/copyright metadata is retained.
- `../vendor/fontkit-1.1.1.umd.min.js`: pinned browser distribution of `@pdf-lib/fontkit@1.1.1` from `https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js`. The upstream package declares the MIT license in its package metadata: https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/package.json. The vendored distribution is unmodified.

The filled reference PDF and its personal data are not distributed with the app. Form text is rebuilt from the current user's reviewed fields.
