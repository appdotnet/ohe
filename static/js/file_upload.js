(function () {
    (function addXhrProgressEvent($) {
        var originalXhr = $.ajaxSettings.xhr;
        $.ajaxSetup({
            progress: $.noop,
            xhr: function () {
                var req = originalXhr(), that = this;
                if (req) {
                    if (typeof req.upload.addEventListener === "function") {
                        req.upload.addEventListener("progress", function (evt) {
                            that.progress(evt);
                        }, false);
                    }
                }
                return req;
            }
        });
    }(jQuery));

    // TODO: make this less janky (no globals)
    window.OmegaFileUploader = function (options) {
        this.activator = options.activator;
        this.file_input = options.file_input;
        this.onfile = options.onfile || $.noop;
        this.onresetfile = options.onresetfile || $.noop;
        this.onuploadstart = options.onuploadstart || $.noop;
        this.onprogress = options.onprogress || $.noop;
        this.onuploaddone = options.onuploaddone || $.noop;
        this.allow = options.allow || false;
        this.ondisallow = options.ondisallow || $.noop;
        this.max_file_size = options.max_file_size || false;
        this.upload_to = options.upload_to;
        this.extra_data = options.extra_data || [];
        this.upload_on_change = options.upload_on_change || false;
        this.upload_state = $.Deferred();
    };

    $.extend(OmegaFileUploader.prototype, {
        handle_change: function (e) {
            var file = (e.target.files && e.target.files.length) ? e.target.files[0] : false;
            if (!e.target.files && !file) {
                var button = $(e.target);
                var form = button.closest('form');
                form.get(0).submit();
                return;
            }

            if (!file) {
                return;
            }

            if (this.allow && !this.allow.test(file.type)) {
                this.ondisallow(file);
                return;
            }

            if (this.max_file_size && this.max_file_size < file.size) {
                var max_in_mb = 100;
                var file_size_in_mb = Math.round((file.size / 1e6) * 100) / 100;
                console.log('The max file size is ' + max_in_mb + 'MB. The file you tried to attach was ' + file_size_in_mb + 'MB');
                return;
            }

            this.file = file;
            this.onfile(file, function () {
                var reader = new FileReader();
                var on_file_read = $.Deferred();
                reader.onload = function (e) {
                    on_file_read.resolve(e);
                };
                reader.readAsDataURL(file);

                return on_file_read;
            });
            if (this.upload_on_change) {
                this.upload_file();
            }
        },
        handle_activator_click: function (e) {
            this.file_input.trigger('click');
            return false;
        },
        bind_events: function () {
            this.activator.on('click.uploader', $.proxy(this.handle_activator_click, this));
            this.bind_file_events();
        },
        bind_file_events: function () {
            this.file_input.on('change.uploader', $.proxy(this.handle_change, this));
        },
        reset_file_upload: function () {
            this.upload_state = $.Deferred();
            this.file_input.off('change.uploader');
            this.file_input.replaceWith(this.file_input.val('').clone(true));
            this.bind_file_events();
            this.onresetfile();
        },
        upload_file: function () {
            this.onuploadstart();
            var data = new FormData();
            data.append('content', this.file);
            _.map(this.extra_data, function (el) {
                data.append(el[0], el[1]);
            });

            // Upload to is the actual network deferred
            this.current_upload = this.upload_to(data, $.proxy(function (e) {
                if (e.lengthComputable) {
                    var percent_done = parseInt((e.loaded / e.total * 100), 10);
                    this.onprogress(percent_done);
                }
            }, this));

            this.current_upload.fail($.proxy(function () {
                console.log('error');
                this.upload_state.reject();
                this.reset_file_upload();
            }, this));

            this.current_upload.done($.proxy(function (resp) {
                this.upload_state.resolve(resp);
                this.onuploaddone(resp);
            }, this));
        },
        update_progress: function (percent_done) {
            this.onprogress(percent_done);
        }
    });
}());