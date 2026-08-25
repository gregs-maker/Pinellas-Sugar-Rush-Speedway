import fs from "node:fs/promises";await fs.copyFile("public/data/rankings.sample.json","public/data/rankings.json");console.log("Restored fictional preview data.");
