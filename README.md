# Hue T-shirt Designer

A simple, modern single-page T-shirt designer MVP built with **Next.js 15**, **React**, **Tailwind CSS**, and **Fabric.js**.

## Features

- Centered T-shirt mockup preview with editable design area
- Shirt color picker (white, black, gray, navy, red)
- Upload logo/image and place it on the shirt
- Add editable text objects
- Drag, resize, and rotate text/images directly on the shirt via Fabric.js controls
- Responsive mobile-friendly layout
- Download final artwork as PNG

## Tech Stack

- Next.js 15 (App Router)
- React 19
- Tailwind CSS
- Fabric.js
- TypeScript

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Run the development server:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000)

## Production Build

```bash
npm run build
npm run start
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [https://vercel.com/new](https://vercel.com/new)
3. Import your GitHub repository.
4. Keep defaults for Next.js and click **Deploy**.

Vercel will auto-detect the framework and build command.

## Notes

- This is intentionally a **front-end only MVP**.
- No authentication, checkout, pricing, or database included.
- Focus is smooth editor interactions and clean UI.
