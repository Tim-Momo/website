/**
 * webpack.config.js
 * =================
 */

const chalk = require('chalk');
const glob = require('glob');
const globImporter = require('node-sass-glob-importer');
const log = require('fancy-log');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');
const StylelintPlugin = require('stylelint-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const VueLoaderPlugin = require('vue-loader/lib/plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const DonePlugin = require('./hooks/done');
const WatchRunPlugin = require('./hooks/watch-run');

const config = {
  debug: false,
  path: {
    components: './src/components',
    dist: '../site/themes/tim/',
    public: '/assets/',
    src: './src',
  },
};

function asyncComponentRegistration() {
  return glob.sync(`${config.path.components}/**/*.async.vue`)
    .map((fileName) => {
      const componentName = path.basename(fileName, '.async.vue');
      const filePath = path.relative(config.path.components, fileName).replace(/\\/g, '/');
      return /^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(componentName)
        ? `Vue.component('${componentName}', () => import(/* webpackChunkName: '${componentName}' */'./${filePath}'));`
        : null;
    })
    .filter(Boolean)
    .join('\n');
}

module.exports = (env, options) => {
  const isDev = options.mode === 'development';

  log(`Starting '${chalk.cyan('build')}' in '${chalk.blue(options.mode)}' mode...`);

  return {
    cache: false,
    devtool: isDev ? 'inline-source-map' : false,
    entry: {
      tim: `${config.path.src}/scripts/tim.js`,
    },
    module: {
      rules: [
        {
          test: /\.vue$/,
          exclude: /node_modules/,
          loader: 'vue-loader',
        },
        {
          test: /\.js$/,
          exclude: /node_modules/,
          loader: 'babel-loader', // config file can be found at _frontend/.babelrc.js
        },
        {
          test: /async\.js$/,
          exclude: /node_modules/,
          include: path.resolve(__dirname, config.path.components),
          loader: 'string-replace-loader',
          options: {
            search: '/* {asyncComponentRegistration} */',
            replace: asyncComponentRegistration,
          },
        },
        {
          test: /\.scss$/,
          exclude: /node_modules/,
          use: [
            'vue-style-loader',
            {
              loader: MiniCssExtractPlugin.loader,
            },
            'css-loader',
            'postcss-loader', // config file can be found at _frontend/.postcssrc.js
            {
              loader: 'sass-loader',
              options: {
                sassOptions: {
                  importer: globImporter(),
                },
              },
            },
          ],
        },
        {
          enforce: 'pre',
          test: /\.(js|vue)$/,
          exclude: /node_modules/,
          loader: 'eslint-loader', // config file can be found at _frontend/.eslintrc.js
          options: {
            cache: true,
          },
        },
      ],
    },
    optimization: {
      minimizer: [
        new UglifyJsPlugin({
          uglifyOptions: {
            output: {
              comments: false,
            },
            compress: {
              drop_console: true,
            },
          },
        }),
      ],
    },
    output: {
      chunkFilename: 'js/[name].[hash].js',
      filename: 'js/[name].js',
      path: path.resolve(__dirname, config.path.dist),
      publicPath: config.path.public,
    },
    plugins: [
      config.debug ? new BundleAnalyzerPlugin() : null,
      new CleanWebpackPlugin({ cleanOnceBeforeBuildPatterns: ['js/**/*', '!.gitkeep'] }),
      new MiniCssExtractPlugin({ filename: 'css/[name].css' }),
      new StylelintPlugin(),
      new VueLoaderPlugin(),
      new DonePlugin(),
      new WatchRunPlugin(),
    ].filter(Boolean),
    resolve: {
      alias: {
        vue: isDev ? 'vue/dist/vue.js' : 'vue/dist/vue.min.js',
      },
      extensions: ['*', '.js', '.vue', '.json'],
    },
    stats: 'errors-warnings',
    watchOptions: {
      ignored: /node_modules/,
    },
  };
};
