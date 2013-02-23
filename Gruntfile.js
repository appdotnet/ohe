module.exports = function (grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n',
        mangle: {
          except: ['jQuery', '$', 'angular']
        },
        compress: true,
        beautify: false
      },
      build: {
        files: {
          'static/build/ohe.min.js': ['static/js/*.js'],
        }
      },
      build_deps: {
        options: {
          mangle: false,
          compress: false,
          beautify: false
        },
        files: {
          'static/build/deps.min.js': ['static/angular-ui/angular-ui.min.js', 'static/underscore/underscore-min.js',
            'static/bootstrap/js/bootstrap.min.js', 'static/select2/select2.min.js']
        }
      }
    },
    sass: {
      build: {
        options: {
          style: 'compressed',
          loadPath: ['static/scss-deps'],
          noCache: true
        },
        files: {
          'static/build/ohe.min.css': 'static/scss/product.scss'
        }
      },
      build_deps: {
        options: {
          style: 'compressed',
          noCache: true
        },
        files: {
          // hacked these file extensions from .css to .scss so grunt-sass-contrib will work (have a pull-request to fix this)
          'static/build/deps.min.css': ['static/angular-ui/angular-ui.scss', 'static/select2/select2.scss']
        }
      }
    },
    hash: {
      src: 'static/build/*.*',
      mapping: 'asset_map.json',
      dest: 'static/dist/'
    },
    watch: {
      js: {
        files: ['static/js/*.js'],
        tasks: ['uglify:build', 'hash']
      },
      js_deps: {
        files: ['static/angular-ui/*.js', 'static/underscore/*.js',
          'static/bootstrap/js/*.js', 'static/select2/*.js'],
        tasks: ['uglify:build_deps', 'hash']
      },
      css: {
        files: ['static/scss/*.scss'],
        tasks: ['sass', 'hash']
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-sass');
  grunt.loadNpmTasks('grunt-hash');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.registerTask('default', ['sass', 'uglify', 'hash']);
};