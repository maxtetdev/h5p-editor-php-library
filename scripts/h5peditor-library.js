/* global ns */
/**
 * Callback for setting new parameters.
 *
 * @callback H5PEditor.newParams
 * @param {Object} field Current field details.
 * @param {Object} params New parameters.
 */

/**
 * Create a field where one can select and include another library to the form.
 *
 * @class H5PEditor.Library
 * @extends H5P.EventDispatcher
 * @param {Object} parent Parent field in editor.
 * @param {Object} field Details for current field.
 * @param {Object} params Default parameters.
 * @param {newParams} setValue Callback for setting new parameters.
 */
ns.Library = function (parent, field, params, setValue) {
  var self = this;

  H5P.EventDispatcher.call(this);
  if (params === undefined) {
    this.params = {
      params: {}
    };
    // If you do a console log here it might show that this.params is
    // something else than what we set it to. One of life's big mysteries...
    setValue(field, this.params);
  }
  else {
    this.params = params;
  }
  this.field = field;
  this.parent = parent;
  this.changes = [];
  this.optionsLoaded = false;
  this.library = parent.library + '/' + field.name;

  this.passReadies = true;
  parent.ready(function () {
    self.passReadies = false;
  });

  // Confirmation dialog for changing library
  this.confirmChangeLibrary = new H5P.ConfirmationDialog({
    headerText: H5PEditor.t('core', 'changeLibrary'),
    dialogText: H5PEditor.t('core', 'confirmChangeLibrary')
  }).appendTo(document.body);

  // Load library on confirmation
  this.confirmChangeLibrary.on('confirmed', function () {
    self.loadLibrary(self.$select.val());
  });

  // Revert to current library on cancel
  this.confirmChangeLibrary.on('canceled', function () {
    self.$select.val(self.currentLibrary);
  });

  H5P.externalDispatcher.on('datainclipboard', function (event) {
    if (!self.libraries) {
      return; // Libraries not loaded yet.
    }

    var canPaste = !event.data.reset;
    if (canPaste) {
      // Check if content type is supported here
      canPaste = self.canPaste(H5P.getClipboard());
    }
    self.$pasteButton.toggleClass('disabled', !canPaste);
  });
};

ns.Library.prototype = Object.create(H5P.EventDispatcher.prototype);
ns.Library.prototype.constructor = ns.Library;

/**
 * Append the library selector to the form.
 *
 * @alias H5PEditor.Library#appendTo
 * @param {H5P.jQuery} $wrapper
 */
ns.Library.prototype.appendTo = function ($wrapper) {
  var that = this;
  var html = '<div class="field ' + this.field.type + '">';

  if (this.field.label !== 0 && this.field.label !== undefined) {
    html += '<div class="h5p-editor-flex-wrapper">' +
        '<label class="h5peditor-label-wrapper">' +
          '<span class="h5peditor-label' +
            (this.field.optional ? '' : ' h5peditor-required') + '">' +
              this.field.label +
          '</span>' +
        '</label>' +
      '</div>';
  }

  if (this.field.description) {
    html += ns.createDescription(this.field.description);
  }

  html += '<select>' + ns.createOption('-', 'Loading...') + '</select>';

  /**
   * For some content types with custom editors, we don't want to add the copy
   * and paste button, since it is handled by the custom editors themself.
   *
   * @return {boolean}
   */
  var enableCopyAndPaste = function () {
    var librarySelector = ns.findLibraryAncestor(that.parent);
    if (librarySelector.currentLibrary !== undefined) {

      var library = ns.libraryFromString(librarySelector.currentLibrary);

      var config = {
        'H5P.CoursePresentation': {
          major: 1,
          minor: 20
        },
        'H5P.InteractiveVideo': {
          major: 1,
          minor: 20
        },
        'H5P.DragQuestion': {
          major: 1,
          minor: 13
        }
      }[library.machineName];

      if (config === undefined) {
        return true;
      }

      return library.majorVersion > config.major ||
        (library.majorVersion == config.major && library.minorVersion >= config.minor);
    }

    return true;
  };

  if (window.localStorage && enableCopyAndPaste()) {
    html += ns.createCopyPasteButtons();
  }

  html += '<div class="libwrap"></div>';

  html += '</div>';

  this.$myField = ns.$(html).appendTo($wrapper);
  this.$select = this.$myField.children('select');
  this.$label = this.$myField.find('.h5peditor-label');
  this.$libraryWrapper = this.$myField.children('.libwrap');
  if (window.localStorage) {
    this.$copyButton = this.$myField.find('.h5peditor-copy-button').click(function () {
      if (this.classList.contains('disabled')) {
        return;
      }

      that.validate(); // Make sure all values are up-to-date
      H5P.clipboardify(that.params);

      ns.attachToastTo(
        that.$copyButton.get(0),
        H5PEditor.t('core', 'copiedToClipboard'),
        {position: {horizontal: 'center', vertical: 'above', noOverflowX: true}}
      );
    });
    this.$pasteButton = this.$myField.find('.h5peditor-paste-button').click(function () {

      // Inform user why paste is not possible
      if (this.classList.contains('disabled')) {
        const pasteCheck = ns.canPastePlus(H5P.getClipboard(), that.libraries);
        if (pasteCheck.canPaste !== true) {
          if (pasteCheck.reason === 'pasteTooOld' || pasteCheck.reason === 'pasteTooNew') {
            that.confirmPasteError(pasteCheck.description, that.$select.offset().top, function () {});
          }
          else {
            ns.attachToastTo(
              this,
              pasteCheck.description,
              {position: {horizontal: 'center', vertical: 'above', noOverflowX: true}}
            );
          }
          return;
        }
      }
      that.replaceContent(H5P.getClipboard());
    });
  }
  ns.LibraryListCache.getLibraries(that.field.options, that.librariesLoaded, that);
};

/**
 * Check if the clipboard can be pasted into this selector.
 *
 * @param {Object} [clipboard]
 * @return {boolean}
 */
ns.Library.prototype.canPaste = function (clipboard) {
  if (clipboard && clipboard.generic) {
    for (var i = 0; i < this.libraries.length; i++) {
      if (this.libraries[i].uberName === clipboard.generic.library) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Hide fields that are not required.
 */
ns.Library.prototype.hide = function () {
  this.hideLibrarySelector();
  this.hideCopyPaste();
};

/**
 * Hide library selector.
 */
ns.Library.prototype.hideLibrarySelector = function () {
  this.$myField.children('select').hide();
};

/**
 * Hide copy button and paste button.
 */
ns.Library.prototype.hideCopyPaste = function () {
  this.$myField.children('.h5peditor-copypaste-wrap').hide();
};

/**
 * Replace library content using given clipboard
 *
 * @param {Object} [clipboard]
 */
ns.Library.prototype.replaceContent = function (clipboard) {
  var self = this;

  // Check if content type is supported here
  if (!self.canPaste(clipboard)) {
    console.error('Tried to paste unsupported sub-content');
    return;
  }

  // Load library on confirmation
  ns.confirmReplace(this.params.library, this.$select.offset().top, function () {
    // Update UI
    self.$select.val(clipboard.generic.library);

    // Delete old params (to keep object ref)
    for (var prop in self.params) {
      if (self.params.hasOwnProperty(prop)) {
        delete self.params[prop];
      }
    }

    // Update params
    for (prop in clipboard.generic) {
      if (clipboard.generic.hasOwnProperty(prop)) {
        self.params[prop] = clipboard.generic[prop];
      }
    }

    // Load form
    self.loadLibrary(clipboard.generic.library, true);
  });
};

/**
 * Confirm replace if there is content selected
 *
 * @param {function} next
 */
ns.Library.prototype.confirmReplace = function (next) {
  if (this.params.library) {
    // Confirm changing library
    var confirmReplace = new H5P.ConfirmationDialog({
      headerText: H5PEditor.t('core', 'changeLibrary'),
      dialogText: H5PEditor.t('core', 'confirmChangeLibrary')
    }).appendTo(document.body);
    confirmReplace.on('confirmed', next);
    confirmReplace.show(this.$select.offset().top);
  }
  else {
    // No need to confirm
    next();
  }
};

/**
 * Handler for when the library list has been loaded
 *
 * @alias H5PEditor.Library#librariesLoaded
 * @param {Array} libList
 */
ns.Library.prototype.librariesLoaded = function (libList) {
  var self = this;
  this.libraries = libList;

  var options = ns.createOption('-', '-');
  for (var i = 0; i < self.libraries.length; i++) {
    var library = self.libraries[i];
    if (library.uberName === self.params.library ||
        (library.title !== undefined && (library.restricted === undefined || !library.restricted))) {
      options += ns.createOption(library.uberName, library.title, library.uberName === self.params.library);
    }
  }

  self.$select.html(options).change(function () {
    // Use timeout to avoid bug in Chrome >44, when confirm is used inside change event.
    // Ref. https://code.google.com/p/chromium/issues/detail?id=525629
    setTimeout(function () {
      // Check if library is selected
      if (self.params.library) {
        // Confirm changing library
        self.confirmChangeLibrary.show(self.$select.offset().top);
      }
      else {
        // Load new library
        self.loadLibrary(self.$select.val());
      }
    }, 0);
  });

  if (self.libraries.length === 1) {
    self.$select.hide();
    self.$myField.children('.h5p-editor-flex-wrapper').add(self.$copyButton).add(self.$pasteButton).hide();
    self.loadLibrary(self.$select.children(':last').val(), true);
  }
  else if (window.localStorage && self.canPaste(H5P.getClipboard())) {
    // Toggle paste button when libraries are loaded
    self.$pasteButton.toggleClass('disabled', false);
  }

  if (self.runChangeCallback === true) {
    // In case a library has been selected programmatically trigger change events, e.g. a default library.
    self.change();
    self.runChangeCallback = false;
  }
  // Load default library.
  if (this.params.library !== undefined) {
    self.loadLibrary(this.params.library, true);
  }
};

/**
 * Load the selected library.
 *
 * @alias H5PEditor.Library#loadLibrary
 * @param {string} libraryName On the form machineName.majorVersion.minorVersion
 * @param {boolean} [preserveParams]
 */
ns.Library.prototype.loadLibrary = function (libraryName, preserveParams) {
  var that = this;

  this.removeChildren();

  if (libraryName === '-') {
    delete this.params.library;
    delete this.params.params;
    delete this.params.subContentId;
    delete this.params.metadata;

    this.$libraryWrapper.attr('class', 'libwrap');
    this.$copyButton.toggleClass('disabled', true);
    return;
  }

  this.$libraryWrapper.html(ns.t('core', 'loading')).attr('class', 'libwrap ' + libraryName.split(' ')[0].toLowerCase().replace('.', '-') + '-editor');

  ns.loadLibrary(libraryName, function (semantics) {
    that.currentLibrary = libraryName;
    that.params.library = libraryName;

    if (preserveParams === undefined || !preserveParams) {
      // Reset params
      delete that.params.subContentId;
      that.params.params = {};
      that.params.metadata = {};
    }
    if (that.params.subContentId === undefined) {
      that.params.subContentId = H5P.createUUID();
    }
    if (that.params.metadata === undefined) {
      that.params.metadata = {};
    }

// TODO: Add select library title to metadata params !
    that.$libraryWrapper.html('');

    // Add metadata form for subcontent
    const metadataSettings = that.findLibraryMetadataSettings(libraryName);
    if (!metadataSettings.disable) {
      that.metadataForm = new ns.MetadataForm(that, that.params.metadata, that.$libraryWrapper, !metadataSettings.disableExtraTitleField, true);
    }
    else {
      that.metadataForm = null; // Prevent usage of last selected content's metadata form
    }

    ns.processSemanticsChunk(semantics, that.params.params, that.$libraryWrapper, that);
    if (window.localStorage) {
      that.$copyButton.toggleClass('disabled', false);
    }

    if (that.metadataForm && metadataSettings.disableExtraTitleField) {
      // Find another location for the metadata button
      for (let i = 0; i < that.children.length; i++) {
        if (that.children[i].$item) {
          // Use the first field with a valid $item
          that.metadataForm.appendButtonTo(that.children[i].$item.children('.h5p-editor-flex-wrapper'));
          break;
        }
      }
    }

    if (that.libraries !== undefined) {
      that.change();
    }
    else {
      that.runChangeCallback = true;
    }
  });
};

/**
 * Locate the Library Metadata Settings object for the given library.
 *
 * @param {String} libraryName
 * @return {Object}
 */
ns.Library.prototype.findLibraryMetadataSettings = function (libraryName) {
  const self = this;

  let metadata;
  for (let i = 0; i < self.libraries.length; i++) {
    if (self.libraries[i].uberName === self.libraryName)  {
      library = self.libraries[i].metadata;
      break;
    }
  }

  return metadata ? metadata : {
    disable: !ns.enableMetadata(libraryName),
    disableExtraTitleField: false
  };
};

/**
 * Add the given callback or run it.
 *
 * @alias H5PEditor.Library#change
 * @param {Function} callback
 */
ns.Library.prototype.change = function (callback) {
  if (callback !== undefined) {
    // Add callback
    this.changes.push(callback);
  }
  else {
    // Find library
    var library, i;
    for (i = 0; i < this.libraries.length; i++) {
      if (this.libraries[i].uberName === this.currentLibrary) {
        library = this.libraries[i];
        break;
      }
    }

    // Run callbacks
    for (i = 0; i < this.changes.length; i++) {
      this.changes[i](library);
    }
  }
};

/**
 * Validate this field and its children.
 *
 * @alias H5PEditor.Library#validate
 * @returns {boolean}
 */
ns.Library.prototype.validate = function () {
  var valid = true;

  if (this.metadataForm && this.metadataForm.children) {
    for (var i = 0; i < this.metadataForm.children.length; i++) {
      if (this.metadataForm.children[i].validate() === false) {
        valid = false;
      }
    }
  }

  if (this.children) {
    for (var i = 0; i < this.children.length; i++) {
      if (this.children[i].validate() === false) {
        valid = false;
      }
    }
  }
  else if (this.libraries && this.libraries.length) {
    valid = false;
  }

  return (this.field.optional ? true : valid);
};

/**
 * Collect functions to execute once the tree is complete.
 *
 * @alias H5PEditor.Library#ready
 * @param {Function} ready
 */
ns.Library.prototype.ready = function (ready) {
  if (this.passReadies) {
    this.parent.ready(ready);
  }
  else {
    this.readies.push(ready);
  }
};

/**
 * Custom remove children that supports common fields.
 *
 * * @alias H5PEditor.Library#removeChildren
 */
ns.Library.prototype.removeChildren = function () {
  if (this.metadataForm && this.metadataForm.children !== undefined) {
    ns.removeChildren(this.metadataForm.children);
  }

  if (this.currentLibrary === '-' || this.children === undefined) {
    return;
  }

  // Remove old metadata form and button
  if (this.$metadataFormWrapper) {
    this.$metadataFormWrapper.remove();
    delete this.$metadataFormWrapper;
    this.$metadataButton.remove();
    delete this.$metadataButton;
  }

  var ancestor = ns.findAncestor(this.parent);

  for (var libraryPath in ancestor.commonFields) {
    var library = libraryPath.split('/')[0];

    if (library === this.currentLibrary) {
      var remove = false;

      for (var fieldName in ancestor.commonFields[libraryPath]) {
        var field = ancestor.commonFields[libraryPath][fieldName];
        if (field.parents.length === 1) {
          field.instance.remove();
          remove = true;
        }

        for (var i = 0; i < field.parents.length; i++) {
          if (field.parents[i] === this) {
            field.parents.splice(i, 1);
            field.setValues.splice(i, 1);
          }
        }
      }

      if (remove) {
        delete ancestor.commonFields[libraryPath];
      }
    }
  }

  ns.removeChildren(this.children);
};

/**
 * Allows ancestors and widgets to do stuff with our children.
 *
 * @alias H5PEditor.Library#forEachChild
 * @param {Function} task
 */
ns.Library.prototype.forEachChild = function (task) {
  for (var i = 0; i < this.children.length; i++) {
    if (task(this.children[i], i)) {
      return;
    }
  }
};

/**
 * Called when this item is being removed.
 *
 * @alias H5PEditor.Library#remove
 */
ns.Library.prototype.remove = function () {
  this.removeChildren();
  if (this.$select !== undefined) {
    this.$select.parent().remove();
  }
};

// Tell the editor what widget we are.
ns.widgets.library = ns.Library;
