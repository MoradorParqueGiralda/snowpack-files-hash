const fs = require("fs");
const path = require("path");
const { Files } = require("./files.js");

function parseOptions(pluginOptions) {
    const defOptions = {
        baseUrl: "",
        exclude: [],
        searchImportsIn: ["html", "php", "js"],
        hashLength: 12,
        hashFiles: ["js", "css"], // css, js, svg, jpg, png...
    };
    for (let param in pluginOptions) {
        if (defOptions[param] !== undefined && typeof defOptions[param] === typeof pluginOptions[param]) {
            defOptions[param] = pluginOptions[param];
        }
    }
    return defOptions;
}

function getModulesDir(buildDirectory, log) {
    const posibles = ["_snowpack/pkg", "web_modules"];
    for (const dir of posibles.map((d) => path.join(buildDirectory, d))) {
        if (fs.existsSync(dir)) {
            return dir;
        }
    }

    log(`Could not find the path to the modules directory. Possibles ["_snowpack/pkg", "web_modules"]`);
    return false;
}

module.exports = (snowpackConfig, pluginOptions) => {
    const options = parseOptions(pluginOptions);

    return {
        name: "snowpack-files-hash",
        async optimize({ buildDirectory, log }) {
            const modulesDir = getModulesDir(buildDirectory, log);
            if (!modulesDir) {
                return;
            }

            Files.buildDirectory = buildDirectory;
            Files.log = log;
            Files.modulesDir = modulesDir;
            Files.options = options;

            log("Starting...");
            await Files.build();

            if (Files.error) {
                log(Files.error);
                return;
            }

            log("Complete.");
        },
    };
};
