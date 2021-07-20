const fs = require("fs");
const path = require("path");
const { Files } = require("./files.js");

function parseOptions(pluginOptions) {
    const defOptions = {
        baseUrl: "",
        exclude: ["snowpack.config.js"],
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

let config;
/**
 * @#return { string } config.buildOptions.metaUrlPath or "_snowpack/pkg" in a backwards-compatible way.
 * /
function extractModDir() {
    if (config.buildOptions.metaUrlPath)
        return config.buildOptions.metaUrlPath;
    else
        return "_snowpack/pkg";
}*/

/**
 * this gets the webModules dir
 *
 * @param {string} buildDirectory
 * @param {(message: string) => void} log
 * @return { string | false } the module dir or false
 */
function getModulesDir(buildDirectory, log) {
    const base = ["_snowpack/pkg", "web_modules"];
    const possibles = config.buildOptions.metaUrlPath ? [config.buildOptions.metaUrlPath].concat(base) : base;
    for (const dir of possibles.map((d) => path.join(buildDirectory, d))) {
        const other = path.join(dir, "pkg");
        if (fs.existsSync(other)) {
            return other;
        } else if (fs.existsSync(dir)) {
            return dir;
        }
    }
    log(`Could not find the path to the modules directory. Possibles ["${possibles.join('", "')}"]`);
    return false;
}
/**
 * @type { import("snowpack").SnowpackPluginFactory }
 */
module.exports = (_SnowpackConfig, pluginOptions) => {
    const options = parseOptions(pluginOptions);

    return {
        name: "snowpack-files-hash",
        config(snowpackConfig) {
            config = snowpackConfig;
        },
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
