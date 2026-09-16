import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// What the browser tab, Google and a WhatsApp link preview say.
//
// These live in index.html, which both sites share, so both were served the
// booking product's title over the platform's description — a tab reading
// "अन्वयBook.ai" on the platform site, and a preview promising the booking site's
// visitors that "the doctor's consultation writes itself", which is अन्वयScribe
// and is not on sale there. The one line a stranger reads before deciding
// whether to click was describing a different product.
//
// Rewritten at build time rather than from React, so a crawler and a link
// preview — neither of which runs the app — see the right words.
const META = {
  book: {
    title: 'अन्वयBook.ai — clinic appointments on WhatsApp',
    description:
      'अन्वयBook.ai helps Indian clinics automate appointment booking, reminders, cancellations and waitlist recovery on WhatsApp — in any language, without hiring.',
  },
  platform: {
    title: 'Anvaya — one thread through the whole clinic visit',
    description:
      "Anvaya — one thread through the whole clinic visit. Patients book on WhatsApp, the desk confirms, and the doctor's consultation writes itself.",
  },
};

const siteMeta = () => (process.env.VITE_SITE === 'book' ? META.book : META.platform);

const htmlMeta = () => ({
  name: 'html-meta',
  transformIndexHtml(html: string) {
    const { title, description } = siteMeta();
    return html
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
      .replace(
        /<meta name="description" content="[\s\S]*?"\s*\/>/,
        `<meta name="description" content="${description}" />`,
      );
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), htmlMeta()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
