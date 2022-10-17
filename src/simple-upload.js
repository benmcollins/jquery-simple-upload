import $ from 'jquery';

import './simple-upload.scss';
import { NAMESPACE } from './consts';

const DEFAULTS = {
  url: '',
  dropZone: null,
};

var entryList = [];
var totalSize = 0;

function basename(path) {
   return path.split('/').reverse()[0];
}

async function processItems(dataTransferItemList)
{
  let entries = [];

  for (let i = 0; i < dataTransferItemList.length; i++) {
    let item = dataTransferItemList[i];

    if (typeof item.webkitGetAsEntry === "function")
      entries.push(item.webkitGetAsEntry());
    else if (typeof item.getAsEntry === "function")
      entries.push(item.getAsEntry());
  }

  await handleEntries(entries);
}

async function handleEntries(entries)
{
  while(entries.length > 0) {
    let entry = entries.shift();

    if (entry.isDirectory) {
      entryList.push(entry);

      let newentries = await readAllDirectoryEntries(entry);
      await handleEntries(newentries);
    } else if (entry.isFile) {
      await new Promise((resolve, reject) => {
        entry.file((file) => {
          totalSize += file.size;
          file.fullPath = entry.fullPath;
          entryList.push(file);
          resolve();
        });
      });
    }
  }
}

async function readAllDirectoryEntries(dirEntry)
{
  let reader = dirEntry.createReader();
  let entries = [];
  let readEntries = await readEntriesPromise(reader);

  while (readEntries.length > 0) {
    entries.push(...readEntries);
    readEntries = await readEntriesPromise(reader);
  }

  return entries;
}

async function readEntriesPromise(directoryReader)
{
  try {
    return await new Promise((resolve, reject) => {
      directoryReader.readEntries(resolve, reject);
    });
  } catch (err) {
    console.log(err);
  }
}

export default class SimpleUpload {
  constructor(input, options = {}) {
    this.options = $.extend({}, DEFAULTS, options);

    this.$input = $(input);
    this.$dropZone = $(this.options.dropZone);

    let uid = new Date().getTime() + Math.random();
    this.namespace = `${NAMESPACE}-${uid}`;

    totalSize = 0;
    this.uploaded = 0;
    this.dragCounter = 0;

    this.init();
  }

  init() {
    this.$input.addClass(NAMESPACE);
    this.$dropZone.addClass(NAMESPACE).addClass('simple-upload-droppable');

    this.unbind();
    this.bind();
  }

  destroy() {
    this.$input.removeClass(NAMESPACE);
    this.$dropZone.removeClass(NAMESPACE).removeClass('simple-upload-droppable');

    this.unbind();
  }

  bind() {
    this.$input.on(`change.${this.namespace}`, (e) => {
      totalSize = 0;
      for (let i = 0; i < e.target.files.length; i++)
        totalSize += e.target.files[i].size;

      this.process(e.target.files);
    });

    this.$dropZone.on(`drop.${this.namespace}`, (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dragCounter = 0;
      this.$dropZone.removeClass('simple-upload-dragover');

      totalSize = 0;
      entryList = [];

      processItems(e.originalEvent.dataTransfer.items).then(result => {
        this.process(entryList);
      });
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

  process(items) {
    this.before(items);

    let d = (new $.Deferred()).resolve();

    for (let i = 0; i < items.length; i++) {
      d = d.then(() => {
        let item = items[i];
        if (typeof item.isDirectory !== 'undefined' && item.isDirectory) {
          return this.mkcol(item.fullPath, i).then();
        } else {
          return this.uploadFile(item, i)
        }
      });
    }

    d.then(() => {
      this.after();
    })
  }

  mkcol(dir, index) {
    let d = new $.Deferred();
    this.progress(true, basename(dir), index, 0, 0, 0);
    $.ajax($.extend({
      url: this.options.url + dir,
      method: 'MKCOL',
      processData: false,
      contentType: false,
      xhr: () => {
        let xhr = $.ajaxSettings.xhr();
        if (xhr.upload) {
          xhr.upload.addEventListener('progress', (e) => {
          }, false);
        }
        return xhr;
      }}, {})
    ).done((data, status, xhr) => {
      this.done(dir, index, data, status, xhr);
    }).fail((xhr, status, error) => {
      console.log(xhr.status);
      if (xhr.status == 405)
        this.done(dir, index, xhr, status, error);
      else
        this.fail(dir, index, xhr, status, error);
    }).always(() => {
      d.resolve();
    });
    return d.promise();
  }

  uploadFile(file, index) {
    let d = new $.Deferred();
    let path = file.fullPath ? file.fullPath : '/' + file.name;
    $.ajax($.extend({
      url: this.options.url + path,
      method: 'PUT',
      data: file,
      processData: false,
      contentType: false,
      xhr: () => {
        let xhr = $.ajaxSettings.xhr();
        if (xhr.upload) {
          xhr.upload.addEventListener('progress', (e) => {
            this.progress(false, file.name, index, e.loaded, totalSize, this.uploaded);
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

  before(list) {
    this.uploaded = 0;
    this.$input.trigger('upload:before', [list]);
  }

  after() {
    this.$input.value = '';
    this.$input.trigger('upload:after');
  }

  progress(isDir, file, index, loaded, total, countDone) {
    this.$input.trigger('upload:progress', [isDir, file, index, loaded, total, countDone]);
  }

  done(file, index, data, status, xhr) {
    this.$input.trigger('upload:done', [file, index, data, status, xhr]);
  }

  fail(file, index, xhr, status, error) {
    this.$input.trigger('upload:fail', [file, index, xhr, status, error]);
  }

  end(file, index) {
    this.uploaded += file.size;

    this.$input.trigger('upload:end', [file, index]);
  }
}
