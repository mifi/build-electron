#!/usr/bin/env node
import webpack from 'webpack';
import meow from 'meow';
import assert from 'assert';
import { unlink, writeFile, mkdir } from 'fs/promises';
import { isAbsolute, join } from 'path';

const cli = meow(`
	Usage
	  $ build-electron [options]
`, {
	importMeta: import.meta,
	flags: {
		config: { type: 'string', alias: 'c' },
    dev: { type: 'boolean', alias: 'd' }
	},
});

const {
  dev: development,
  projectRoot = process.cwd(),
  config: configPath = join(projectRoot, 'build-electron.config.js'),
} = cli.flags;

const resolvePath = (path) => isAbsolute(path) ? path : join(projectRoot, path)

const config = (await import(resolvePath(configPath))).default;

const {
  mainEntry,
  preloadEntry,
  mainExtraEntries,
  preloadExtraEntries,
  outDir,
  externals,
  customConfig,
  customMainConfig,
  customPreloadConfig,
  mainTarget = 'electron16.0-main',
  preloadTarget = 'electron16.0-preload',
} = config;

assert(mainEntry || preloadEntry);
assert(outDir);
assert(mainTarget);
assert(preloadTarget);

const doneSignalFilePath = join(outDir, '.build-electron-done');

const commonConfig = {
  mode: development ? 'development' : 'production',

  externals: {
    'electron': 'commonjs2 electron',
    'electron-devtools-installer': 'commonjs2 electron-devtools-installer',

    ...externals,
  },

  devtool: 'inline-source-map', // todo prod https://webpack.js.org/configuration/devtool/
};


export const getMainConfig = ({ entry, extraEntries, target }) => ({
  ...commonConfig,
  target,
  entry: {
    main: entry,
    ...extraEntries,
  },
  output: {
    path: resolvePath(outDir),
    filename: '[name].js',
    chunkFormat: 'commonjs',
  },
  ...customConfig,
  ...customMainConfig,
});

export const getPreloadConfig = ({ entry, extraEntries, target }) => ({
  ...commonConfig,
  target,
  entry: {
    preload: entry,
    ...extraEntries,
  },
  output: {
    path: resolvePath(outDir),
    filename: '[name].js',
    chunkFormat: 'commonjs',
  },
  ...customConfig,
  ...customPreloadConfig,
});

const main = mainEntry && webpack(getMainConfig({
  entry: resolvePath(mainEntry),
  target: mainTarget,
  extraEntries: mainExtraEntries && Object.fromEntries(Object.entries(mainExtraEntries).map(([key, value]) => ([key, resolvePath(value)]))),
}));

const preload = preloadEntry && webpack(getPreloadConfig({
  entry: resolvePath(preloadEntry),
  target: preloadTarget,
  extraEntries: preloadExtraEntries && Object.fromEntries(Object.entries(preloadExtraEntries).map(([key, value]) => ([key, resolvePath(value)]))),
}));

// mkdir -p
try {
  await mkdir(outDir);
} catch (err) {
  if (err.code !== 'EEXIST') throw err;
}

await unlink(doneSignalFilePath).catch(() => {});

if (development) {
  main.watch({}, (err, stats) => {
    if (err) console.error(err);
    else console.log(stats.toString());
  });
  
  preload.watch({}, (err, stats) => {
    if (err) {
      console.error(err);
      return;
    }

    console.log(stats.toString());
    writeFile(doneSignalFilePath, Buffer.alloc(0));
  });
} else {
  main.run((err, stats) => {
    if (err) console.error(err);
    else console.log(stats.toString());
  });
  
  preload.run((err, stats) => {
    if (err) console.error(err);
    else console.log(stats.toString());
  });
}
