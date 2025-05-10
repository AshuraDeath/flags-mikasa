/** @type {import('tailwindcss').Config} */
export default {
    content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,vue}"], // Ensure DaisyUI works with all components
    theme: {
        extend: {},
    },
    plugins: [require("daisyui")], // Add DaisyUI here
};
