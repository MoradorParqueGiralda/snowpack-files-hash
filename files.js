const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class Files {
    constructor() {
        this.buildDirectory = "";
        this.error = "";
        /** @type {Function} */
        this.log = undefined;
        this.modulesDir = "";
        /** @type {{baseUrl: string, exclude: string[], searchImportsIn: string[], hashLength: number, hashFiles: string[]}} */
        this.options = undefined;
    }

    /**
     * @method  start
     */
    async build() {
        let hashMap = await this._getFilesToHash();
        hashMap = await this._buildHashes(hashMap);
        await this._sourcesReplace(hashMap);
        await this._rewriteImportMap(hashMap);

        fs.writeFileSync(path.join(this.buildDirectory, "assets-hashmap.json"), JSON.stringify(hashMap, null, 2), "utf8");
    }

    /**
     * @method  _rewriteImportMap
     *
     * @param {{[index:string]: {[index:string]: string}}} hashMap
     */
    async _rewriteImportMap(hashMap) {
        if (!fs.existsSync(path.join(this.modulesDir, "import-map.json"))) {
            return;
        }

        const importMap = JSON.parse(fs.readFileSync(path.join(this.modulesDir, "import-map.json"), "utf8"));
        for (const importFile in importMap.imports) {
            const absolutPath = path.join(this.modulesDir, importMap.imports[importFile]);
            const relativePath = this._normalizePath(path.relative(this.buildDirectory, absolutPath));

            if (hashMap?.js[relativePath]) {
                importMap.imports[importFile] = hashMap.js[relativePath];
            }
        }

        fs.writeFileSync(path.join(this.modulesDir, "import-map.json"), JSON.stringify(importMap, null, 2));
    }

    /**
     * @method	_getHash
     * @access private
     *
     * Obtiene el hash de un archivo
     *
     * @param {string} filePath Ruta del archivo
     */
    async _getHashFile(filePath) {
        return new Promise((resolve, reject) => {
            var stream = fs.ReadStream(filePath);
            var md5sum = crypto.createHash("md5");

            stream.on("data", function (data) {
                md5sum.update(data);
            });

            stream.on("end", function () {
                resolve(md5sum.digest("hex"));
            });
        });
    }

    /**
     * @method  _hashFiles
     * @access private
     */
    async _getFilesToHash() {
        return new Promise((resolve, reject) => {
            const files = {};

            this.options.hashFiles.forEach((extension) => {
                if (!files[extension]) {
                    files[extension] = {};
                }

                const filesInPath = this._getFilesInPath(this.buildDirectory, true, extension);

                filesInPath.forEach((file) => {
                    const relative = path.relative(this.buildDirectory, file);
                    const normalize = this._normalizePath(relative);
                    if (this.options.exclude.indexOf(normalize) === -1) {
                        files[extension][normalize] = "";
                    }
                });
            });

            resolve(files);
        });
    }

    /**
     * @method  _buildHashes
     * @param {{[index:string]: {[index:string]: string}}} hashMap
     * @returns {Promise<{[index:string]: {[index:string]: string}}>}
     */
    async _buildHashes(hashMap) {
        for (const ext in hashMap) {
            if (ext === "js" || ext === "mjs") {
                continue;
            }

            this.log(`Hashing .${ext} files...`);

            for (const fileToHash in hashMap[ext]) {
                const fileToHashNormalize = path.normalize(path.join(this.buildDirectory, fileToHash));

                hashMap = await this._hahsFile(fileToHash, fileToHashNormalize, ext, hashMap);
            }
        }

        for (const ext in hashMap) {
            if (ext !== "js" && ext !== "mjs") {
                continue;
            }

            this.log(`Hashing .${ext} files...`);

            // Obtenemos todos los arvhivos javasctip
            const javasciptFiles = this._getFilesInPath(this.buildDirectory, true, ext);

            for (const fileToHash in hashMap[ext]) {
                // Si el archivo ya se a hasheado en alguna dependencia
                if (hashMap[ext][fileToHash]) {
                    continue;
                }

                const pathToFile = path.normalize(path.join(this.buildDirectory, fileToHash));
                hashMap = await this._jsDependenciesSearch(fileToHash, pathToFile, hashMap, javasciptFiles);
            }
        }

        return hashMap;
    }

    /**
     * @method _hasFile
     *
     * @param {string} fileToHash
     * @param {string} pathToFile
     * @param {string} ext
     * @param {{[index:string]: {[index:string]: string}}} hashMap
     * @returns {{[index:string]: {[index:string]: string}}}
     */
    async _hahsFile(fileToHash, pathToFile, ext, hashMap) {
        let hash = await this._getHashFile(pathToFile);
        hash = hash.slice(0, this.options.hashLength);

        const pathParse = path.parse(pathToFile);
        const newName = `${pathParse.name}.${hash}${pathParse.ext}`;
        const newPathHashed = path.join(pathParse.dir, newName);

        fs.renameSync(pathToFile, newPathHashed);

        const relative = path.relative(this.buildDirectory, newPathHashed);
        hashMap[ext][fileToHash] = this._normalizePath(relative);

        return hashMap;
    }

    /**
     * @method  _jsDependenciesSearch
     *
     * @param {string} fileToHash
     * @param {string} pathToFile
     * @param {{[index:string]: {[index:string]: string}}}} hashMap
     * @param {string[]} javascriptFiles
     * @returns
     */
    async _jsDependenciesSearch(fileToHash, pathToFile, hashMap, javascriptFiles) {
        // Obtenemos el contenido del archivo javascript
        let content = fs.readFileSync(pathToFile, "utf-8");

        if (hashMap.js[fileToHash] === undefined || hashMap.js[fileToHash]) {
            return hashMap;
        }

        // Buscamos las dependencias
        const importExpr = /(import\([\"\'\`]([A-z0-9\.\/\-_@%#?+]+)[\"\'\`]\))|import((\s+)?{?[A-z0-9\.\/\-_\s\,]+}?(\s+)?|\s+?\*\sas\s[A-z0-9\.\/\-_]+\s+?)?(\s+)?(from)?(\s+)?([\"\'\`]([A-z0-9\.\/\-_@%#?+]+)[\"\'\`])/g;
        const matches = content.matchAll(importExpr);

        let hasDependencies = false;
        for (const match of matches) {
            hasDependencies = true;
            const importStatment = match[0];
            const importedSrc = match[10] || match[2];

            // Obtenemos la ruta al importado y el relativo al importado
            const pathToImportedSrc = path.join(path.parse(pathToFile).dir, importedSrc);
            const importedSrcHashname = this._normalizePath(path.relative(this.buildDirectory, pathToImportedSrc));

            // Si el componente ya está hasheado se continua
            if (hashMap.js[importedSrcHashname]) {
                continue;
            }

            // Hasehamos las dependencias
            hashMap = await this._jsDependenciesSearch(importedSrcHashname, pathToImportedSrc, hashMap, javascriptFiles);
        }

        // Hasheamos el archivo
        hashMap = await this._hahsFile(fileToHash, pathToFile, "js", hashMap);
        // console.warn( "-----------------  " + fileToHash );
        // console.warn( hashMap.js );

        // Recorremos todos los archivos javascript y reemplaazamso el hasheado
        javascriptFiles.forEach((jsFile) => {
            if (fs.existsSync(jsFile)) {
                let content = fs.readFileSync(jsFile, "utf-8");
                fs.writeFileSync(jsFile, this._replaceJsImportExpr(jsFile, content, hashMap), "utf-8");
            }
        });

        return hashMap;
    }

    /**
     * @method  _sourcesReplace
     * @param {{[index:string]: {[index:string]: string}}} hashMap
     */
    async _sourcesReplace(hashMap) {
        this.options.searchImportsIn.forEach((extension) => {
            this.log(`Replacing assets in .${extension} files...`);
            const filesInPath = this._getFilesInPath(this.buildDirectory, true, extension);

            filesInPath.forEach((file) => {
                let content = fs.readFileSync(file, "utf-8");
                fs.writeFileSync(file, this._sourcesContentReplace(file, content, hashMap), "utf-8");
            });
        });
    }

    /**
     * @method  _findInHashmap
     *
     * @param {string} file
     * @param {object} hashMap
     * @returns {string|null}
     */
    _findInHashmap(file, hashMap) {
        for (const ext in hashMap) {
            if (hashMap[ext][file]) {
                return hashMap[ext][file];
            }
        }

        return null;
    }

    /**
     * @method	get_files_inpath
     * @access private
     *
     * Buscar archviso dentro de un path dado incluyendo sus subdirectorios si se especifica.
     *
     * @param 	{string} 	pathSearch 			Path donde se van a buscar los archivos
     * @param 	{boolean} 	includeSubdirs 		Si se debe buscar en los subdirectorios
     * @param 	{string} 	ext 				La extensión de archivos que hay que buscar
     * @return 	{Promise<string[]>}
     */
    _getFilesInPath(pathSearch, includeSubdirs = false, ext = null) {
        let files = this._getRecursiveFiles(pathSearch, includeSubdirs);

        if (!ext) {
            return files;
        } else {
            let extfiles = [];
            for (let i = 0; i < files.length; i++) {
                const re = new RegExp(`.${ext}$`, "g");
                if (files[i].match(re)) {
                    extfiles.push(files[i]);
                }
            }

            return extfiles;
        }
    }

    /**
     * @method	get_files
     * @access private
     *
     * Obtiene todos los archvos de un directorio de manera recursiva
     *
     * @param 	{string} 	pathSearch 			Path donde se van a buscar los archivos
     * @param 	{boolean} 	includeSubdirs 		Si se debe buscar en los subdirectorios
     * @return 	{array}							Archivos dentro del directorio
     */
    _getRecursiveFiles(pathSearch, includeSubdirs = false) {
        let els = this._readDir(pathSearch);
        let files = [];

        let length = els.length;
        for (let i = 0; i < length; i++) {
            let stats = fs.statSync(els[i]);
            if (stats.isDirectory() && includeSubdirs) {
                let subels = this._readDir(els[i]);
                for (let o = 0; o < subels.length; o++) {
                    els.push(subels[o]);
                }

                length = els.length;
            } else if (stats.isFile()) {
                files.push(els[i]);
            }
        }

        return files;
    }

    /**
     * @method  _normalizePath
     * @param {string} path
     * @returns {string}
     */
    _normalizePath(path) {
        return path.replace(/\\/g, "/");
    }

    /**
     * @method	read_dir
     *
     * Lee el contenido de un directorio y devuelve sus elementos
     *
     * @param 	{string} 	pathSearch 			Path donde se van a buscar los elementos
     * @return	{array}							Elementos que se encuentran dentro del directorio
     */
    _readDir(pathSearch) {
        let files = [];
        let els = fs.readdirSync(pathSearch, "utf-8");

        for (let i = 0; i < els.length; i++) {
            let stats = fs.statSync(path.join(pathSearch, els[i]));
            if ((els[i] != "." && els[i] != ".." && stats.isDirectory()) || stats.isFile()) {
                files.push(path.join(pathSearch, els[i]));
            }
        }

        return files;
    }

    /**
     * @method  _replaceSrcExpr
     *
     * @param {string} file
     * @param {string} content
     * @param {{[index:string]: {[index:string]: string}}} hashMap
     */
    _replaceSrcExpr(file, content, hashMap) {
        const srcExpr = /src=[\"\']([A-z0-9-_\.\/@%#?+]+)[\"\']/g;
        const matches = content.matchAll(srcExpr);

        for (const match of matches) {
            const src = match[0];
            const pathSrc = match[1];

            const parseFile = path.parse(file);
            let absolutePath = "";
            if (pathSrc[0] === "/") {
                absolutePath = path.join(this.buildDirectory, pathSrc);
            } else {
                absolutePath = path.join(parseFile.dir, pathSrc);
            }

            const srcFile = this._normalizePath(path.relative(this.buildDirectory, absolutePath));
            const srcHashed = this._findInHashmap(srcFile, hashMap);

            if (srcHashed !== null) {
                let newSrc = "";
                if (pathSrc[0] === "/") {
                    newSrc = src.replace(`/${srcFile}`, `${this.options.baseUrl}/${srcHashed}`);
                } else {
                    newSrc = src.replace(srcFile, srcHashed);
                }

                content = content.replace(src, newSrc);
            }
        }

        return content;
    }

    /**
     * @method  _replaceHrefExpr
     *
     * @param {string} file
     * @param {string} content
     * @param {{[index:string]: {[index:string]: string}}} hashMap
     */
    _replaceHrefExpr(file, content, hashMap) {
        const hrefExpr = /href=[\"\']([A-z0-9-_\.\/@%#?+]+)[\"\']/g;
        const matches = content.matchAll(hrefExpr);

        for (const match of matches) {
            const src = match[0];
            const pathSrc = match[1];

            const parseFile = path.parse(file);
            let absolutePath = "";
            if (pathSrc[0] === "/") {
                absolutePath = path.join(this.buildDirectory, pathSrc);
            } else {
                absolutePath = path.join(parseFile.dir, pathSrc);
            }

            const srcFile = this._normalizePath(path.relative(this.buildDirectory, absolutePath));
            const srcHashed = this._findInHashmap(srcFile, hashMap);

            if (srcHashed !== null) {
                let newSrc = "";
                if (pathSrc[0] === "/") {
                    newSrc = src.replace(`/${srcFile}`, `${this.options.baseUrl}/${srcHashed}`);
                } else {
                    newSrc = src.replace(srcFile, srcHashed);
                }

                content = content.replace(src, newSrc);
            }
        }

        return content;
    }

    /**
     * @method  _replaceImportExpr
     *
     * @param {string} file
     * @param {string} content
     * @param {{[index:string]: {[index:string]: string}}} hashMap
     */
    _replaceJsImportExpr(file, content, hashMap) {
        const importExpr = /(import\([\"\'\`]([A-z0-9\.\/\-_@%#?+]+)[\"\'\`]\))|import((\s+)?{?[A-z0-9\.\/\-_\s\,]+}?(\s+)?|\s+?\*\sas\s[A-z0-9\.\/\-_]+\s+?)?(\s+)?(from)?(\s+)?([\"\'\`]([A-z0-9\.\/\-_@%#?+]+)[\"\'\`])/g;
        const matches = content.matchAll(importExpr);

        for (const match of matches) {
            const src = match[0];
            const pathSrc = match[10] || match[2];

            const parseFile = path.parse(file);
            let absolutePath = "";
            if (pathSrc[0] === "/") {
                absolutePath = path.join(this.buildDirectory, pathSrc);
            } else {
                absolutePath = path.join(parseFile.dir, pathSrc);
            }

            const srcFile = this._normalizePath(path.relative(this.buildDirectory, absolutePath));
            const srcHashed = this._findInHashmap(srcFile, hashMap);

            if (srcHashed !== null) {
                const srcRelativeOr = this._normalizePath(path.relative(path.parse(file).dir, absolutePath));
                const srcRealtiveHash = this._normalizePath(path.relative(path.parse(file).dir, path.join(this.buildDirectory, srcHashed)));

                let newSrc = "";
                if (pathSrc[0] === "/") {
                    newSrc = src.replace(`/${srcRelativeOr}`, `${this.options.baseUrl}/${srcRealtiveHash}`);
                } else {
                    newSrc = src.replace(srcRelativeOr, srcRealtiveHash);
                }

                // if(file === "D:\\node-packages\\snowpack-test\\build\\components\\Buttons\\outter-button.js" && srcFile === "modules/request.js") {
                // if(srcFile.indexOf("request.js") > -1) {
                //     console.log( file );
                //     console.log( pathSrc );
                //     console.log( srcHashed );
                //     console.log( srcFile );
                //     console.log( srcRelativeOr ); // NOTE: Sustituir esto por...
                //     console.log( srcRealtiveHash );
                // }

                content = content.replace(src, newSrc);
            }
        }

        return content;
    }

    /**
     * @method  _sourcesContentReplace
     *
     * @param {string} file
     * @param {string} content
     * @param {{[index:string]: {[index:string]: string}}} hashMap
     */
    _sourcesContentReplace(file, content, hashMap) {
        content = this._replaceSrcExpr(file, content, hashMap);
        content = this._replaceHrefExpr(file, content, hashMap);

        return content;
    }
}

module.exports.Files = new Files();
