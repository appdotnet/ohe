module.exports = function(grunt) {

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
        src: 'static/js/*.js',
        dest: 'static/build/ohe.min.js'
      }
    },
    sass: {
      dist: {
        options: {
            style: 'compressed',
            loadPath: [
              'static/scss-deps'
            ],
        noCache: true
        },
        files: {
          'static/build/ohe.min.css': 'static/scss/product.scss'
        }
      }
    },
    watch: {
        js: {
            files: ['static/js/*.js'],
            tasks: ['uglify']
        },
        css: {
            files: ['static/scss/*.scss'],
            tasks: ['sass']
        }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-sass');
  grunt.loadNpmTasks('grunt-contrib-watch');

  // Default task(s).
  grunt.registerTask('default', ['sass', 'uglify']);
};
