import $ from 'jquery';

import './simple-upload.scss';
import { NAMESPACE } from './consts';

const DEFAULTS = {
  url: '',
  dropZone: null,
  progress: null,
};

export default class SimpleUpload {
  constructor(input, options = {}) {
    this.options = $.extend({}, DEFAULTS, options);

    this.$input = $(input);
    this.$dropZone = $(this.options.dropZone);
    this.$progress = $(this.options.progress);

    let uid = new Date().getTime() + Math.random();
    this.namespace = `${NAMESPACE}-${uid}`;

    this.totalSize = 0;
    this.uploaded = 0;
    this.dragCounter = 0;

    this.init();
  }

  init() {
    this.$input.addClass(NAMESPACE);
    this.$dropZone.addClass(NAMESPACE).addClass('simple-upload-droppable');
    this.$progress.addClass(NAMESPACE);

    this.unbind();
    this.bind();
  }

  destroy() {
    this.$input.removeClass(NAMESPACE);
    this.$dropZone.removeClass(NAMESPACE).removeClass('simple-upload-droppable');
    this.$progress.removeClass(NAMESPACE);

    this.unbind();
  }

  bind() {
    this.$input.on(`change.${this.namespace}`, (e) => {
      this.process(e.target.files);
      e.target.value = '';
    });

    if (this.$dropZone.length) {
      this.$dropZone.on(`drop.${this.namespace}`, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dragCounter = 0;
        this.$dropZone.removeClass('simple-upload-dragover');
        this.process(e.originalEvent.dataTransfer.files);
      }).on(`dragenter.${this.namespace}`, (e) => {
        e.preventDefault();
        this.dragCounter++;
        this.$dropZone.addClass('simple-upload-dragover');
      }).on(`dragleave.${this.namespace}`, (e) => {
        e.preventDefault();
        this.dragCounter--;
        if (this.dragCounter == 0) {
          this.$dropZone.removeClass('simple-upload-dragover');
        }
      });

      $(document).on(`drop.${this.namespace}`, (e) => {
        e.preventDefault();
      }).on(`dragover.${this.namespace}`, (e) => {
        e.preventDefault();
      });
    }
  }

  unbind() {
    this.$input.off(`.${this.namespace}`);
    this.$dropZone.off(`.${this.namespace}`);
    $(document).off(`.${this.namespace}`);

    let events = $._data(this.$input.get(0), 'events');
    if (events) {
      let names = Object.keys(events).filter(name => name.match(/^upload:/));
      this.$input.off(names.join(' '));
    }
  }

  process(files) {
    if (this.$input.prop('disabled'))
      return;

    this.$input.prop('disabled', true);
    this.before(files);

    let d = (new $.Deferred()).resolve();
    for (let i = 0; i < files.length; i++) {
      d = d.then(() => {
        return this.uploadFile(files[i], i)
      });
    }
    d.then(() => {
      this.after(files);
      this.$input.prop('disabled', false);
    })
  }

  uploadFile(file, index) {
    let d = new $.Deferred();
    $.ajax($.extend({
      url: this.options.url + '/' + file.name,
      method: 'PUT',
      data: file,
      processData: false,
      contentType: false,
      xhr: () => {
        let xhr = $.ajaxSettings.xhr();
        if (xhr.upload) {
          xhr.upload.addEventListener('progress', (e) => {
            this.progress(file, index, e.loaded, e.total);
          }, false);
        }
        return xhr;
      }}, {})
    ).done((data, status, xhr) => {
      this.done(file, index, data, status, xhr);
    }).fail((xhr, status, error) => {
      this.fail(file, index, xhr, status, error);
    }).always(() => {
      this.end(file, index);
      d.resolve();
    });
    return d.promise();
  }

  before(files) {
    this.totalSize = 0;
    this.uploaded = 0;

    if (this.$progress.length) {
      for (let i = 0; i < files.length; i++) {
        let file = files[i];
        this.buildProgress(file, i);
        this.totalSize += file.size;
      }
    }

    this.$input.trigger('upload:before', [files]);
  }

  after(files) {
    this.$input.trigger('upload:after', [files]);
  }

  progress(file, index, loaded, total) {
    this.findProgress(index).find('.simple-upload-percent').text(Math.ceil((loaded/total)*100) + '%');

    this.$input.trigger('upload:progress', [this.uploaded, this.totalSize, loaded]);
  }

  done(file, index, data, status, xhr) {
    this.$input.trigger('upload:done', [file, index, data, status, xhr]);
  }

  fail(file, index, xhr, status, error) {
    this.$input.trigger('upload:fail', [file, index, xhr, status, error]);
  }

  end(file, index) {
    this.findProgress(index).hide('fast', (elem) => $(elem).remove());
    this.uploaded += file.size;

    this.$input.trigger('upload:end', [file, index]);
  }

  buildProgress(file, index) {
    let $p = $('<div>').addClass('simple-upload-progress').data('upload-index', index);
    $('<span>').addClass('simple-upload-filename').text(file.name).appendTo($p);
    $('<span>').addClass('simple-upload-percent').text('...').appendTo($p);
    this.$progress.append($p);
  }

  findProgress(index) {
    return this.$progress.find('.simple-upload-progress').filter((i, elem) => {
      return $(elem).data('upload-index') == index;
    });
  }
}
