# snowpack-files-hash

Apply a content hash to the type of files that you choose, helping to control the cache of your web app in browsers.

It will also search and replace the imports of the files hashed in the type of files that you also choose. This is especially useful if you work with PHP files instead of HTML for example or if you use web components and you are hashing CSS or images that are sometimes called within components, snowpack-files-hash will look for these elements in the content of the files and it will modify them by the hashed path.

## Use

---
**To ensure that everything gets hashed, place this plugin at the end of your plugin list!**

```javascript
/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  ...config,
  plugins: [
    ...OtherPlugins
    [
      "snowpack-files-hash",
      {
        // Path to be treated as absolute in relation to root project for imported assets as absolute. Ex.: "/build"
        baseUrl: "",
        // Files will be hashed. Ex.: "js", "css", "png", "svg", "jpg"
        hashFiles: ["js", "css"],
        // Files will be excludes
        exclude: ["snowpack.config.js"],
        // Lenght of hash
        hashLength: 12,
        // Files where to find and replace files that have been hashed
        searchImportsIn: ["html", "php", "js"],
      }
    ]
  ],
};
```
