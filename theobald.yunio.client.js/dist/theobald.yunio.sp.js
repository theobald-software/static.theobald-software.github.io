/*! yunIO JavaScript Component | (c) Theobald Software GmbH | theobald-software.com */

// TODO: test refactor to Promises.

class TheobaldYunioSharepoint {
    static #constants = {
        YUNIO_API_KEY_FIELDNAME: 'YUNIO-APIKEY',
        YUNIO_URL_FIELDNAME: 'YUNIO-URL',
        SettingsListName: 'YunioSettings',
    }

    static #localizationStrings = {
        en: {
            InfoDataLoading: 'Loading Data...',
            errors: {
                customPropertiesSave: 'Saving one or more custom properties failed silently',
                e403: 'Remote call reached the server, but was not allowed to communicate. Project Properties RemoteEndpoints allowed? Url should be "http(s)://"',
                genericCall: 'Remote call failed. Probably server is unreachable',
                getSetting: 'Setting retrieval failed (has it been added?)'
            },
            promptApiKey: 'Please specify yunIO API Key:',
            promptUrl: 'Please specify yunIO URL:',
        },
        de: {
            InfoDataLoading: 'Daten werden geladen...',
            errors: {
                customPropertiesSave: 'Eine oder mehrere Properties konnten nicht gespeichert werden',
                e403: 'Der entfernte Rechner hat geantwortet, jedoch wurde weitere Kommunikation verweigert. Sind in Projekteigenschaften RemoteEndpoints freigeschaltet? Der Url-Muster "http(s)://"', // zugelassen
                genericCall: 'Remote-Aufruf ist gescheitert. Möglicherweise ist der Server unerreichbar',
                getSetting: 'Einstellung konnte nicht gelesen werden'
            },
            promptApiKey: 'Bitte geben Sie den yunIO-ApiKey ein',
            promptUrl: 'Bitte geben Sie nun den yunIO-URL ein.',
            warningNoData: 'Warnung: die "data"-Eigenschaft ist leer.'
        }
    }

    constructor(lang = 'en') {
        this.#strings = TheobaldYunioSharepoint.#localizationStrings[lang];
    }

    //#region Common Helpers

    static getSharepointUrl() {
        var hostUrl = '';
        if (document.URL.indexOf('?') !== -1) {
            var params = document.URL.split('?')[1].split('&');
            for (var i = 0; i < params.length; i++) {
                var prm = decodeURIComponent(params[i]);
                if (/^SPAppWebUrl=/i.test(prm)) { //SPHostUrl
                    hostUrl = prm.split('=')[1];
                    return hostUrl + '/_layouts/15/';
                }
            }
        }

        return hostUrl;
    }

    findItemByTitle(items, itemTitle) {
        for (var itemIndex in items) {
            var item = items[itemIndex];

            if (item.title === itemTitle) {
                return item;
            }
        }
    }

    //#endregion Common Helpers

    //#region Property Getters

    // Shortcuts for custom lists, immediate invocation, no callbacks
    getClientContext() {
        return window.SP.ClientContext.get_current() || new window.SP.ClientContext(TheobaldYunioSharepoint.getSharepointUrl());
    }

    getWeb(context) {
        return (context && context.get_web()) || this.getClientContext().get_web();
    }

    getLists(context) {
        return this.getWeb(context).get_lists();
    }

    getSettingsList() {
        return this.getLists().getByTitle(this.#constants.SettingsListName);
    }

    //#endregion Property Getters

    //#region Request Executor

    invokeWebProxy(options) {
        var self = this,
            method = options.method || 'POST',
            // https://     sbNamespace     azure.windows.net       myServiceName       /   MyFunction
            url = options.url,
            sharepointUrl = TheobaldYunioSharepoint.getSharepointUrl();

        function invokeInternal() {
            var context = self.getClientContext(),
                request = new window.SP.WebRequestInfo();

            if (method === 'POST') {
                request.set_body(JSON.stringify({
                    data: options.data || {}
                }));
            }
            // else {
            //     var param = options.parameterName || self.constants.testing.TEST_PARAMETER,
            //         paramVar = '?' + param + '=';
            //     url += paramVar + (options.value || counter);
            // }

            console.debug('THEO.SP: CallingFromSharepoint ' + url);

            request.set_url(url);
            request.set_method(method);
            request.set_headers(options.headers || {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            });

            //http://msdn.microsoft.com/en-us/library/office/fp179895(v=office.15).aspx
            var response = window.SP.WebProxy.invoke(context, request);

            //attemptLogin not documented

            // Set the event handlers and invoke the request.
            context.executeQueryAsync(
                successHandler,
                // if server has not responded or async failed
                function () {
                    var responseData = response.get_body();
                    options.fail(responseData);
                });

            // if server responded at all
            function successHandler() {
                // Note: Some other status codes, such as 302 redirect do not trigger the errorHandler.
                if (response.get_statusCode() == 200) {
                    var responseBody = response.get_body(),
                        json = JSON.parse(responseBody);
                    //console.log(json);
                    if (json.Error) {
                        options.fail('ERPError: ' + json.Error);
                        return;
                    }
                    options.done(JSON.parse(json.Success));
                } else {
                    var errorMessage, errorDetails,
                        statusCode = response.get_statusCode();

                    // higher level logic
                    if (statusCode == 403) {
                        // we know what is in 403 body
                        errorMessage = self.#strings.errors.e403;
                    } else {
                        errorMessage = self.#strings.errors.genericCall;
                    }
                    // original info
                    errorDetails = response.get_statusCode() + ': ' + response.get_body();

                    options.fail({
                        title: errorMessage,
                        error: errorDetails + ' (url: ' + url + ')'
                    });

                    console.debug(errorMessage + ' ' + errorDetails + ' ' + url);
                }
            }
        }

        if (window.SP) { //this.spLoaded
            invokeInternal();
        } else {
            // use predefined in theobald.loader prefix
            if (!sharepointUrl) {
                (sharepointUrl = 'sp/');
            }
            // fetch
            const scriptPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                document.body.appendChild(script);
                script.onload = resolve;
                script.onerror = reject;
                script.async = true;
                script.src = sharepointUrl + 'sp.runtime.js';
            });

            scriptPromise.then(() => {
                const scriptPromise2 = new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    document.body.appendChild(script);
                    script.onload = resolve;
                    script.onerror = reject;
                    script.async = true;
                    script.src = sharepointUrl + 'sp.runtime.js';
                });
                scriptPromise2.then(() => {
                    self.spLoaded = true;
                    invokeInternal();
                });
            });
        }
    }

    // Request helpers
    serviceFailed(result, field) {
        var formattedResult = this.#strings.errors.genericCall + ', field "' + field + '": ' + result.status + '  ' + result.statusText;
        console.log(formattedResult);

        return formattedResult;
    }

    serviceSucceeded(result, field) {
        var formattedResult = typeof result === 'string' ? result : result[field + 'Result'];
        console.trace('success: ' + formattedResult);

        return formattedResult;
    }

    //#endregion Request Executor

    //#region Sharepoint Lists

    getListHandle(listName, callback, callbackError) {
        var context = this.getClientContext(),
            lists = this.getLists();

        function onGetListsSuccess() {
            var listEnumerator = lists.getEnumerator();

            while (listEnumerator.moveNext()) {
                var currentList = listEnumerator.get_current(),
                    title = currentList.get_title();
                if (title === listName) {
                    if (callback) {
                        callback(currentList);
                    }
                    return;
                }
            }

            // no list
            if (callback) {
                callback(null);
            }
        }

        function onGetListsFail(sender, args) {
            console.warn('Failed to get lists. %s\n%s', args.get_message(), args.get_stackTrace());

            if (callbackError) {
                callbackError(sender, args);
            }
        }

        context.load(lists);
        context.executeQueryAsync(onGetListsSuccess, onGetListsFail);
    }

    getAllLists(callback, callbackError) {
        var context = this.getClientContext(),
            lists = this.getLists();

        function onGetListsSuccess() { //lists_retrieved
            var listEnumerator = lists.getEnumerator(),
                listNames = [];

            while (listEnumerator.moveNext()) {
                listNames.push(listEnumerator.get_current().get_title());
            }

            console.trace('%o', listNames);

            if (callback) {
                callback(listNames);
            }
        }

        function onGetListsFail(sender, args) {
            console.warn('Failed to get lists. %s\n%s', args.get_message(), args.get_stackTrace());

            if (callbackError) {
                callbackError(sender, args);
            }
        }

        context.load(lists);
        context.executeQueryAsync(onGetListsSuccess, onGetListsFail);
    }

    createList(listName, callback, callbackError) {
        var self = this,
            context = this.getClientContext(),
            listCreationInfo = new window.SP.ListCreationInformation(),
            lists = this.getLists();

        function onListCreationSuccess() {
            self.getAllLists(
                function (lists) {
                    if (callback) {
                        callback(lists);
                    }
                },
                function (sender, args) {
                    if (callbackError) {
                        callbackError(sender, args);
                    }
                });
        }

        function onListCreationFail(sender, args) {
            console.warn('Failed to create the list. ' + args.get_message());

            if (callbackError) {
                callbackError(sender, args);
            }
        }

        listCreationInfo.set_title(listName);
        listCreationInfo.set_templateType(window.SP.ListTemplateType.genericList);
        var newList = lists.add(listCreationInfo);
        context.load(newList);
        context.executeQueryAsync(onListCreationSuccess, onListCreationFail);
    }

    deleteList(listName, callback, callbackError) {
        const context = this.getClientContext();
        //lists = this.getLists();
        //selectedList = lists.getByTitle(listName);

        this.getListHandle(listName, function (listHandle) {
            if (!listHandle) {
                console.warn('List not found.');
                // no list === success
                if (callback) {
                    callback();
                }
            }

            listHandle.deleteObject();

            context.executeQueryAsync(
                function () {
                    console.trace('List "%s" deleted', listName);

                    if (callback) {
                        callback(listName);
                    }
                },
                function (sender, args) {
                    console.warn('List deletion failed. %s\n%s', args.get_message(), args.get_stackTrace());

                    if (callbackError) {
                        callbackError(sender, args);
                    }
                }
            );
        }, callbackError);
    }

    //    {
    //        listHandle: lh,
    //            OR
    //        listName: 'myList',
    //        fieldHandle: fh,
    //            OR
    //        default field 'value'
    //    }
    createTextFieldInList(options) {
        var self = this,
            targetList = options.listHandle;

        function onFieldAddFail(sender, args) {
            console.warn('Field add FAILED: %s\n%s', args.get_message(), args.get_stackTrace());
            if (options.callbackError) {
                options.callbackError(sender, args);
            }
        }

        if (targetList) {
            var context = options.context || this.getClientContext(),
                field = options.fieldHandle || targetList.get_fields().addFieldAsXml(
                    '<Field DisplayName="' + (options.fieldName || 'Value') + '" Type="Text" />',
                    true,
                    window.SP.AddFieldOptions.defaultValue
                );

            context.load(field);
            context.executeQueryAsync(
                function () {
                    console.trace('field added: %s', options.fieldName || 'default "Value"');
                    if (options.callback) {
                        options.callback(field, targetList);
                    }
                },
                onFieldAddFail
            );
        } else {
            this.getListHandle(
                options.listName,
                function (listHandle) {
                    options.listHandle = listHandle;

                    self.createTextFieldInList(options);
                },
                onFieldAddFail
            );
        }
    }

    // #endregion Sharepoint Lists

    // #region Atomic Item Operations

    createListItem(options) {
        var self = this,
            listItem = options.item,
            context = options.context || this.getClientContext(),
            selectedList = options.listHandle,
            newItem;

        function onItemCreationFail(sender, args) {
            console.warn('Failed to create the item. %s\n%s', args.get_message(), args.get_stackTrace());

            if (options.callbackError) {
                options.callbackError(sender, args);
            }
        }

        function onItemCreationSuccess() {
            console.trace('list item added %o', listItem);

            if (options.callback) {
                options.callback(newItem);
            }
        }

        if (selectedList) {
            var listItemCreationInfo = new window.SP.ListItemCreationInformation();

            newItem = selectedList.addItem(listItemCreationInfo);
            newItem.set_item('Title', listItem.name);
            newItem.set_item('Value', listItem.value);
            newItem.update();
            context.load(newItem);

            return context.executeQueryAsync(onItemCreationSuccess, onItemCreationFail);
        } else {
            this.getListHandle(
                options.listName,
                function (listHandle) {
                    options.listHandle = listHandle;

                    self.createListItem(options);
                },
                onItemCreationFail
            );
            return;
        }
    }

    updateListItem(options) {
        var clientContext = options.context || this.getClientContext(),
            item = options.item || {
                name: options.name,
                value: options.value
            },
            oList = options.listHandle || this.getLists(clientContext).getByTitle(options.listName),
            oListItem = options.itemHandle || oList.getItemById(options.id);

        //clientContext.load(oList);
        //oListItem = oList.getItemById(options.id); //options.itemHandle ||
        oListItem.set_item('Title', item.name);
        oListItem.set_item('Value', item.value);
        oListItem.update();

        clientContext.executeQueryAsync(
            function () {
                console.trace('List Item updated');

                if (options.callback) {
                    options.callback(oListItem);
                }
            },
            function (sender, args) {
                console.warn('Failed to update the item (id: %s, %s). \n %s', options.id, args.get_message(), args.get_stackTrace());

                if (options.callbackError) {
                    options.callbackError(sender, args);
                }
            });
    }

    deleteListItem(listName, itemId, callback, callbackError) {
        var context = this.getClientContext(),
            selectedList = this.getLists().getByTitle(listName);

        function onDeleteItemSuccess() {
            console.trace('list item deleted');

            if (callback) {
                callback();
            }
        }

        function onDeleteItemFail(sender, args) {
            console.warn('Failed to delete the item. %s', args.get_message());

            if (callbackError) {
                callbackError(sender, args);
            }
        }

        var selectedItemId = itemId,
            selectedItem = selectedList.getItemById(selectedItemId);

        selectedItem.deleteObject();
        selectedList.update();
        context.load(selectedList);

        return context.executeQueryAsync(onDeleteItemSuccess, onDeleteItemFail);
    }

    // for update
    // invoked shows, that list handle search takes place and if list was not found do not search again (loop break)
    // RETURNS HANDLE
    getListItem(options) { //, invoked
        var self = this,
            list = options.listHandle,
            itemName = options.itemName,
            listItemCollection;

        function onGetItemsSuccess() { //sender, args
            var listItemEnumerator = listItemCollection.getEnumerator();

            while (listItemEnumerator.moveNext()) {
                var currentItem = listItemEnumerator.get_current(),
                    title = currentItem.get_item('Title');
                if (title === itemName) {
                    console.trace('Item found: %s', itemName);
                    if (options.callback) {
                        options.callback(currentItem, list);
                    }

                    return;
                }
            }

            // item not found
            if (options.callback) {
                options.callback(null, list);
            }
        }

        if (list) {
            var context = options.context || this.getClientContext(),
                camlQuery = new window.SP.CamlQuery();

            camlQuery.set_viewXml("<View><ViewFields>" +
                "<FieldRef Name='ID' />" +
                "<FieldRef Name='Title' />" +
                "<FieldRef Name='Value' />" +
                "</ViewFields></View>')");

            listItemCollection = list.getItems(camlQuery);
            context.load(listItemCollection, "Include(ID, Title, Value)");
            context.executeQueryAsync(
                onGetItemsSuccess,
                function (sender, args) {
                    console.warn('Could not read items from list. %s\n\%', args.get_message(), args.get_stackTrace());

                    if (options.callbackError) {
                        options.callbackError(sender, args);
                    }
                });
        } else {
            this.getListHandle(
                options.listName,
                function (listHandleFetched) {
                    if (!listHandleFetched) {
                        var error = 'Could not get item "' +
                            itemName + '" ' + 'because the List not found!';

                        console.warn(error + " (%s)", itemName);

                        if (options.callbackError) {
                            options.callbackError(error);
                        }
                        return;
                    } else {
                        options.listHandle = listHandleFetched;

                        self.getListItem(options);
                    }
                },
                function (sender, args) {
                    console.warn('Item "%s" could not be retrieved', itemName);

                    if (options.callbackError) {
                        options.callbackError(sender, args);
                    }
                });
        }
    }

    //#endregion Atomic Item Operations (CRUD)

    //#region Composite Item Operations

    // adds or replaces items
    // items - array or object
    //    addListItems(list, items, callback, callbackError) {
    //        for (var itemIndex in items) {
    //            var item = items[itemIndex];
    //            // add or update
    //            this.updateListItem(item, callback, callbackError);
    //        }
    //    }

    getItemByTitle(listName, itemTitle, callback, callbackError) {
        var self = this;

        this.getListItems({
            listName: listName,
            callback: function (items) {
                if (callback) {
                    callback(
                        self.getItemByTitle(items)
                    );
                }
            },
            callbackError: function (sender, args) {
                console.warn('Get item by title FAILED: %s\n%s', args.get_message(), args.get_stackTrace());

                if (callbackError) {
                    callbackError(sender, args);
                }
            }
        });
    }

    getListItems(options) {
        //listName, callback, callbackError
        var self = this,
            list = options.listHandle,
            listItemCollection,
            listItemObjects = [];

        function onGetItemsFail(sender, args) {
            console.warn('Failed to retrieve items. %s\n\s', args.get_message(), args.get_stackTrace());

            if (options.callbackError) {
                options.callbackError(sender, args);
            }
        }

        function onGetItemsSuccess() { //sender, args
            var listItemEnumerator = listItemCollection.getEnumerator();

            while (listItemEnumerator.moveNext()) {
                var currentItem = listItemEnumerator.get_current();
                listItemObjects.push({
                    id: currentItem.get_item('ID'),
                    title: currentItem.get_item('Title'),
                    value: currentItem.get_item('Value'),
                    handle: currentItem
                });
            }

            console.trace('listItems: %o', listItemObjects);

            if (options.callback) {
                options.callback(listItemObjects, list);
            }
        }

        if (list) {
            var context = options.context || this.getClientContext(),
                camlQuery = new window.SP.CamlQuery();

            camlQuery.set_viewXml("<View><ViewFields>" +
                "<FieldRef Name='ID' />" +
                "<FieldRef Name='Title' />" +
                "<FieldRef Name='Value' />" +
                "</ViewFields></View>')");

            listItemCollection = list.getItems(camlQuery);
            context.load(listItemCollection, "Include(ID, Title, Value)");
            context.executeQueryAsync(onGetItemsSuccess, onGetItemsFail);
        } else {
            this.getListHandle(
                options.listName,
                function (listHandleFromGetItems) {
                    if (listHandleFromGetItems) {
                        options.listHandle = listHandleFromGetItems;
                        self.getListItems(options);
                    } else {
                        var errorString = 'Failed to retrieve items, list "%s" not found!';

                        console.warn(errorString, options.listName);
                        if (options.callbackError) {
                            options.callbackError(errorString, options.listName);
                        }
                    }
                },
                onGetItemsFail
            );
        }
    }

    clearList(listName, callback, callbackError) {
        var ctx = window.SP.ClientContext.get_current(),
            list = this.getLists().getByTitle(listName),
            query = new window.SP.CamlQuery(),
            items = list.getItems(query);

        ctx.load(items, "Include(Id)");
        ctx.executeQueryAsync(function () {
            var enumerator = items.getEnumerator(),
                simpleArray = [];
            while (enumerator.moveNext()) {
                simpleArray.push(enumerator.get_current());
            }
            for (var s in simpleArray) {
                simpleArray[s].deleteObject();
            }
            ctx.executeQueryAsync(
                function () {
                    console.trace('List %s has been cleared.', listName);

                    if (callback) {
                        callback();
                    }
                },
                function (sender, args) {
                    console.warn('Failed to clear list %s.\n%s\n\s', listName, args.get_message(), args.get_stackTrace());

                    if (callbackError) {
                        callbackError(sender, args);
                    }
                });
        });
    }

    //#endregion Composite Item Operations

    //#region Proprietary SETTINGS management

    // used to store user data such as URL and APIKEY
    // set settings after create or dynamic handler
    createSettingsList(settings, callback, callbackError) {
        var self = this;
        this.createList(
            this.#constants.SettingsListName,
            function () { //list
                self.createTextFieldInList({
                    listName: self.constants.SettingsListName,
                    fieldName: 'Value',
                    callback: function (field, listWithField) {
                        // field returned from the generic addField, not req. here
                        if (callback) {
                            callback(listWithField);
                        }
                    },
                    callbackError: callbackError
                });
            },
            function (sender, args) {
                console.warn('Settings list could not be created');
                if (callbackError) {
                    callbackError(sender, args);
                }
            });
    }

    // for restoring to defaults
    listSettingsRemove(callback, callbackError) {
        return this.deleteList(this.#constants.SettingsListName, function () {
            console.trace('Settings list deleted');

            if (callback) {
                callback();
            }
        }, function (sender, args) {
            console.warn('Settings list deletion FAILED: %s\n%s', args.get_message(), args.get_stackTrace());

            if (callbackError) {
                callbackError(sender, args);
            }
        });
    }

    getSettingsList(callback, callbackError) {
        var self = this;

        return this.getListHandle(
            this.#constants.SettingsListName,
            function (listSettings) {
                if (listSettings) {
                    if (callback) {
                        callback(listSettings);
                    }
                } else {
                    self.createSettingsList(
                        null,
                        callback,
                        //                        function () {
                        //                            self.listSettingsGet(callback, callbackError);
                        //                        },
                        callbackError
                    );
                }
            },
            function (sender, args) {
                console.warn('Error searching settings list.\n%s\n%s', args.get_message(), args.get_stackTrace());

                if (callbackError) {
                    callbackError(sender, args);
                }
            });
    }

    //#region Atomic Operations over a Setting

    //addSetting = setSetting = 
    updateSetting(item, callback, callbackError) {
        var self = this,
            name = item.name;
        //value = item.value;

        function settingModifyFail(sender, args) {
            console.warn('Failed Adding Setting: %s.', name);

            if (callbackError) {
                callbackError(sender, args);
            }
        }

        return this.getSettingsList(
            function (settingsList) {
                // getSettingsList insures, that settingsList exists
                self.getListItem({
                    listHandle: settingsList, //self.constants.SettingsListName
                    itemName: name,
                    callback: function (setting, list) {
                        if (setting) {
                            self.updateListItem({
                                itemHandle: setting,
                                listHandle: list, // || settingsList
                                //id: setting.get_item('ID'),
                                item: item,
                                //listName: self.constants.SettingsListName,
                                callback: function () {
                                    console.trace('setting updated: %s', item.name);

                                    if (callback) {
                                        callback(setting);
                                    }
                                },
                                callbackError: function (sender, args) {
                                    console.warn('setting could not be updated: %s', item.name);

                                    if (callbackError) {
                                        callbackError(sender, args);
                                    }
                                }
                            });
                        } else {
                            self.createListItem({
                                listHandle: settingsList,
                                item: item,
                                callback: callback,
                                callbackError: callbackError
                            });
                        }
                    },
                    callbackError: settingModifyFail
                });
            }, settingModifyFail
        );
    }

    parseListItem(listItem) {
        return {
            id: listItem.get_item('ID'),
            name: listItem.get_item('Title'),
            value: listItem.get_item('Value')
        };
    }

    getSetting(settingName, callback, callbackError) {
        var self = this,
            errorString = this.#strings.errors.getSetting;

        this.getListItem({
            listName: this.#constants.SettingsListName,
            itemName: settingName,
            callback: function (setting) {
                if (setting) {
                    console.trace('Setting retrieved. "%s"', settingName);
                    var parsedSetting = self.parseListItem(setting);

                    if (callback) {
                        callback(parsedSetting.value, settingName);
                    }
                } else {
                    console.warn(errorString, settingName);

                    // one param === custom param, two params === SharePoint sender,args mechanism
                    if (callbackError) {
                        callbackError(errorString + settingName);
                    }
                }
            },
            callbackError: function (sender, args) {
                console.warn(errorString + "%s", settingName);

                if (callbackError) {
                    callbackError(sender, args);
                }
            }
        });
    }

    //#endregion Atomic Operations over Item

    //#region Custom Operations over Settings

    addSettings(items, callback, callbackError) {
        for (var itemIndex in items) {
            var item = items[itemIndex];
            // add or update
            this.addSetting(item, callback, callbackError);
        }
    }

    getSettings(callback, callbackError) {
        return this.getListItems({
            listName: this.#constants.SettingsListName,
            callback: function (settings) {
                console.trace('SPList item (setting) retrieved');

                if (callback) {
                    callback(settings);
                }
            },
            callbackError: function (sender, args) {
                console.warn('SPList Settings could not be read');

                if (callbackError) {
                    callbackError(sender, args);
                }
            }
        });
    }

    removeSettings(callback, callbackError) {
        return this.clearList(this.#constants.SettingsListName, function () {
            console.trace('Settings cleared');

            if (callback) {
                callback();
            }
        }, function (sender, args) {
            console.warn('Failed to clear settings. %s\n\s', args.get_message(), args.get_stackTrace());

            if (callbackError) {
                callbackError(sender, args);
            }
        });
    }

    //#endregion Custom Operations over Settings

    //#region Operation shortcuts for known Settings
    // callback gets setting, when it is retrieved

    getYunioApiKey(callback, callbackError) {
        return this.getSetting(TheobaldYunioSharepoint.#constants.YUNIO_API_KEY_FIELDNAME, callback, callbackError);
    }

    setYunioApiKey(apikey, callback, callbackError) {
        return this.setSetting({
            name: TheobaldYunioSharepoint.#constants.YUNIO_API_KEY_FIELDNAME,
            value: apikey
        },
            callback,
            callbackError
        );
    }

    getYunioUrl(callback, callbackError) {
        return this.getSetting(TheobaldYunioSharepoint.#constants.YUNIO_URL_FIELDNAME, callback, callbackError);
    }

    setYunioUrl(url, callback, callbackError) {
        return this.setSetting({
            name: TheobaldYunioSharepoint.#constants.YUNIO_URL_FIELDNAME,
            value: url
        }, callback, callbackError);
    }

    getYunioProperties(callback, callbackError) {
        var propertiesConstants = TheobaldYunioSharepoint.#constants,
            promise = new Promise((resolve, reject) => {
                this.getCustomProperties([
                    propertiesConstants.YUNIO_API_KEY_FIELDNAME,
                    propertiesConstants.YUNIO_URL_FIELDNAME
                ]).then(function (properties) {
                    var userFriendlyProperties = {
                        apikey: properties[propertiesConstants.YUNIO_API_KEY_FIELDNAME],
                        url: properties[propertiesConstants.YUNIO_URL_FIELDNAME]
                    };

                    resolve(userFriendlyProperties);

                    if (callback)
                        callback(userFriendlyProperties);
                }, function (err) {
                    reject(err);

                    if (callbackError)
                        callbackError(err);
                });
            });

        return promise;
    }

    setYunioProperties(properties, callback, callbackerror) {
        var _properties = {};

        if (properties.apikey) {
            _properties[TheobaldYunioSharepoint.#constants.YUNIO_API_KEY_FIELDNAME] = properties.apikey;
        }
        if (properties.url) {
            _properties[TheobaldYunioSharepoint.#constants.YUNIO_URL_FIELDNAME] = properties.url;
        }

        return this.setCustomProperties(_properties, callback, callbackerror);
    }

    // so admin can set the in sharepoint directly in gui
    initYunioProperties(callback, callbackerror) {
        var _properties = {},
            dProperties = [
                TheobaldYunioSharepoint.#constants.YUNIO_API_KEY_FIELDNAME,
                TheobaldYunioSharepoint.#constants.YUNIO_URL_FIELDNAME
            ];

        for (var index in dProperties) {
            _properties[dProperties[index]] = '';
        }

        return this.setCustomProperties(_properties, callback, callbackerror);
    }

    /** Returns a Promise for easy integration into an async workflow. */
    getCustomProperties(propertiesKeys, callback, callbackError) {
        // key not found treated as empty
        const
            self = this,
            promise = new Promise((resolve, reject) => {
                const
                    properties = {},
                    errors = {},
                    // shallow copy
                    _propertiesKeys = propertiesKeys.slice(0);

                function getNextProperty() {
                    // all retrieved?
                    if (_propertiesKeys.length === 0) {
                        if (Object.keys(errors).length > 0) {
                            reject(errors);
                            if (callbackError)
                                callbackError(errors);
                        }

                        resolve(properties);
                        if (callback) {
                            callback(properties);
                        }

                        return promise.resolve(properties);
                    }

                    let currentProperty = _propertiesKeys.pop();

                    self.getSetting(currentProperty,
                        function (propertyValue) {
                            properties[currentProperty] = propertyValue;
                            getNextProperty();
                        },
                        function (error) {
                            errors[currentProperty] = error;
                            getNextProperty();
                        });
                }

                getNextProperty();
            });


        return promise;
    }

    setCustomProperties(properties, callback, callbackError, stopOnError) {
        var self = this,
            // properties must remain immutable
            _properties = JSON.parse(JSON.stringify(properties)),
            // stores the queue
            queue = Object.getOwnPropertyNames(_properties),
            saved = [],
            anyError = false,
            errors = [];

        function saveNextProperty() {
            if (stopOnError && anyError) {
                if (callbackError) {
                    callbackError(errors.join('; '));
                } else {
                    console.debug(self.strings.errors.customPropertiesSave);
                }
                return;
            }
            var currentProperty = queue.pop();
            // it's over
            if (currentProperty === undefined) {
                if (callback) {
                    // return list of saved properties
                    callback(saved);
                } else {
                    console.debug('THEO.SP: Saved: ' + saved);
                }

                return;
            }

            self.setSetting({
                name: currentProperty,
                value: _properties[currentProperty]
            }, function () {
                saved.push(currentProperty);
                saveNextProperty();
            }, function (error) {
                anyError = true;
                errors.push(error);
                saveNextProperty();
            });
        }

        //async
        saveNextProperty();

        return false;
    }

    //#endregion Operation shortcuts for known Settings

    //#region GUI Helpers

    // settings = {my1: "default value", my2: "xxxx"}, promptTexts = {my1: "enter MY1", my2: "put MY2"}
    askCustomSettingsAndSaveToSharepoint(settings, promptTexts, callback, callbackError, customConfirmMessage) {
        var queue = Object.getOwnPropertyNames(settings);
        var confirmText = '';

        do {
            for (var index in queue) {
                var queueIndex = queue[index];
                settings[queueIndex] = window.prompt(promptTexts[queueIndex] || queueIndex, settings[queueIndex]);
                confirmText += queueIndex + ': ' + settings[queueIndex] + '\n';
            }
        }
        while (!confirm(confirmText + "\n" + (customConfirmMessage || "Are these correct?")));

        return this.setCustomProperties(settings, callback, callbackError);
    }

    askSettingsAndSaveToSharepoint(callback, callbackError) {
        var apikey = window.prompt(this.strings.promptApiKey, ''),
            url = window.prompt(this.strings.promptUrl, '');

        return this.setYunioProperties({
            apikey: apikey,
            url: url
        }, callback, callbackError);
    }

    setFullscreenMode(boolFalseForLeaveFullscreen) {
        var //doFS = boolFalseForLeaveFullscreen !== false,
            msFullscreenCssClass = 'ms-fullscreenmode',
            fullScreenButton = document.getElementById("fullscreenmode"),
            exitfullScreenButton = document.getElementById("exitfullscreenmode");

        if (boolFalseForLeaveFullscreen === false) {
            document.body.className = document.body.className.replace(msFullscreenCssClass, '');
            fullScreenButton.style.display = '';
            exitfullScreenButton.style.display = 'none';
        } else {
            document.body.className += ' ' + msFullscreenCssClass;
            fullScreenButton.style.display = 'none';
            exitfullScreenButton.style.display = '';
        }
    }

    //#endregion GUI Helpers
}
