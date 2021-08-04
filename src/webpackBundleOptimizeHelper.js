const concat = (x, y) => x.concat(y);

const flatMap = (f, xs) => xs.map(f).reduce(concat, []);

//https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
function formatBytes(a, b) {
  if (0 === a) return "0 Bytes";
  var c = 1024,
    d = b || 2,
    e = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"],
    f = Math.floor(Math.log(a) / Math.log(c));
  return parseFloat((a / Math.pow(c, f)).toFixed(d)) + " " + e[f];
}

function trimJsonString(json) {
  return json.substring(json.indexOf("{"));
}

const getDependencyNameFromModuleName = (m) => {
  // eslint-disable-next-line
  const regexResult = /.\/node_modules\/([^\/]+)\/.*/.exec(m);
  return regexResult && regexResult.length > 0 ? regexResult[1] : m;
  //return m
};

function getEntrypointAssets(entrypoints) {
  const entrypointKeys = Object.keys(entrypoints);
  return flatMap(
    (entrypoint) => entrypoints[entrypoint].assets,
    entrypointKeys
  ).map((asset) => {
    // Webpack 5 uses an object and webpack 4 a string
    return typeof asset == "string" ? asset : asset.name;
  });
}

function entrypointsContainsJS(entrypoints) {
  return (
    getEntrypointAssets(entrypoints).filter((asset) => asset.indexOf(".js") > 0)
      .length > 0
  );
}
function isValidStatsFile(json) {
  return !!json.entrypoints && !!json.assets;
}

function childHasJsEntry(child) {
  if (isValidStatsFile(child)) {
    return entrypointsContainsJS(child.entrypoints);
  }
  return false;
}
function findChildWithJSEntry(json) {
  if (childHasJsEntry(json)) {
    return json;
  } else {
    if (json.children) {
      return json.children.find((child) => childHasJsEntry(child));
    } else {
      return null;
    }
  }
}

function getDependenciesNotEs6(modulesRaw) {
  if (!modulesRaw) {
    return [];
  }
  const modules = modulesRaw.map((m) => {
    const optimizationBailout = m.optimizationBailout
      ? m.optimizationBailout.filter(
          (b) =>
            b ===
            "ModuleConcatenation bailout: Module is not an ECMAScript module"
        )
      : [];
    return {
      name: m.name,
      notEs6: optimizationBailout.length !== 0,
      size: m.size,
    };
  });
  //  const removeDuplicate = (elem, pos, arr) => arr.indexOf(elem) === pos
  const dependenciesNotEs6 = modules
    .filter((m) => !m.name.startsWith("(webpack)"))
    .filter(
      (m) =>
        m.name.startsWith("./node_modules") ||
        m.name.startsWith("../node_modules")
    )
    .map((m) =>
      Object.assign({}, m, {
        name: getDependencyNameFromModuleName(m.name),
      })
    )
    .filter((m) => m.notEs6)
    //remove duplicates
    .reduce((result = [], object) => {
      const existing = result.find((r) => r.name === object.name);

      if (existing) {
        const newObject = {
          name: object.name,
          notEs6: object.notEs6,
          size: existing.size + object.size,
        };
        return concat(
          result.filter((r) => r.name !== object.name),
          newObject
        );
      } else {
        return result.concat(object);
      }
    }, []);
  //.map(m => m.name)
  //.filter(removeDuplicate)

  return dependenciesNotEs6;
}

function endsWith(str, suffix) {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function getDataFromStatsJson(statsJson) {
  if (!statsJson) {
    return null;
  }
  const json = findChildWithJSEntry(statsJson);
  if (!json) {
    return null;
  }
  const entrypointAssets = getEntrypointAssets(json.entrypoints);

  const entrypointAssetSizes = json.assets
    .filter((a) => entrypointAssets.includes(a.name))
    .filter((a) => !endsWith(a.name, ".map")) //don't show sourcemaps
    .map((a) => ({
      name: a.name,
      size: formatBytes(a.size),
      sizeByte: a.size,
    }));

  const entrypointAssetSizeTotal = entrypointAssetSizes.reduce(
    (acc, o) => acc + o.sizeByte,
    0
  );

  //TODO check if moduleconcatenation plugin is in use

  //console.log('modules', dependenciesNotEs6)
  //console.log('entrypointAssetSizes', entrypointAssetSizes)

  return {
    dependenciesNotEs6: getDependenciesNotEs6(json.modules),
    entrypointAssetSizes,
    entrypointAssetSizeTotal,
  };
}
/*
  This could be a webpack plugin. Then the code would go here
*/
class BundleOptimizeHelperWebpackPlugin {
  apply(compiler) {
    compiler.hooks.done.tap("BundleOptimizeHelperWebpackPlugin", (stats) => {
      const json = stats.toJson({ source: false });
      const data = getDataFromStatsJson(json);
      // do stuffs here
    });
  }
}

module.exports = {
  formatBytes,
  trimJsonString,
  entrypointsContainsJS,
  isValidStatsFile,
  findChildWithJSEntry,
  getDataFromStatsJson,
  BundleOptimizeHelperWebpackPlugin,
};
