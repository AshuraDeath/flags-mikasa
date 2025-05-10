<script setup>
const title = "Welcome to Astro + Vue!";
</script>

<template>
  <!-- TailwindCSS Only -->
  <section
    class="flex flex-col items-center justify-center min-h-screen bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-10"
  >
    <h1
      class="text-5xl font-extrabold mb-4 drop-shadow-lg underline decoration-white"
    >
      {{ title }}
    </h1>
    <p
      class="text-xl max-w-2xl text-center opacity-90 underline decoration-white"
    >
      Build modern, fast, and beautiful websites with Astro, Vue, and
      TailwindCSS.
    </p>
    <button
      class="mt-6 px-6 py-3 bg-white text-blue-600 font-semibold text-lg rounded-lg shadow-md hover:bg-gray-200 transition duration-300"
    >
      Get Started 🚀
    </button>
  </section>

  <!-- DaisyUI Only -->
  <section
    class="flex flex-col items-center justify-center min-h-screen bg-primary text-primary-content p-10"
  >
    <h1
      class="text-5xl font-extrabold mb-4 drop-shadow-lg underline decoration-white"
    >
      {{ title }}
    </h1>
    <p
      class="text-xl max-w-2xl text-center opacity-90 underline decoration-white"
    >
      Build modern, fast, and beautiful websites with Astro, Vue, and DaisyUI.
    </p>
    <button class="btn btn-primary mt-6">Get Started 🚀</button>
  </section>

  <section
    class="flex flex-col items-center justify-center w-full min-w-max min-h-screen bg-orange-100 text-orange-100 p-10"
  >
    <figure class="diff aspect-16/9" tabindex="0">
      <div class="diff-item-1" role="img">
        <div
          class="bg-primary text-primary-content grid place-content-center text-9xl font-black"
        >
          DAISY
        </div>
      </div>
      <div class="diff-item-2" role="img" tabindex="0">
        <div class="bg-base-200 grid place-content-center text-9xl font-black">
          DAISY
        </div>
      </div>
      <div class="diff-resizer"></div>
    </figure>
  </section>
</template>
