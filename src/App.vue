<script setup lang="ts">
import { onMounted } from "vue";
import Logger from "js-logger";
import { powerSync } from "./plugins/powersync";
import { supabase } from "./plugins/supabase";

Logger.useDefaults();
Logger.setLevel(Logger.DEBUG);

onMounted(async () => {
  try {
    await powerSync.init();
    await powerSync.connect(supabase);
    await supabase.init();
  } catch (error) {
    Logger.error("Initialization error:", error);
  }
});
</script>

<template>
  <router-view />
</template>