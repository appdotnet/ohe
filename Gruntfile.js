module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
      },
      build: {
        src: 'static/js/*.js',
        dest: 'build/<%= pkg.name %>.min.js'
      }
    },
    sass: {
      dist: {
        options: {
            style: 'compressed',
            loadPath: [
              '/home/bryan/code/mxml/ohe/static/scss-deps'
            ]
        },
        files: {
          'build/ohe.min.css': 'static/scss/product.scss'
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-sass');

  // Default task(s).
  grunt.registerTask('default', ['sass', 'uglify']);
};
