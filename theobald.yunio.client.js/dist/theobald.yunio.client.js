// yunIO Javascript Component | (c) Theobald Software GmbH | theobald-software.com

export class TheobaldYunioClient {
    //
    // #region string formatters (useful for SAP messages and parameters)
    //

    // I. first parameter - format string
    // next parameters - actual parameters to be put into the format string
    // format('my first parameter: {0}; my second parameter: {1}', firstParameter, secondParameter)
    //
    // II. first parameter - format string with named parameters
    // second parameter object of named parameters {parameter1: 'x', parameter2: 'y'}
    // format('my {which} parameter', {which: 'awesome'})
    static format(str, col) {
        col = typeof col === 'object' ? col : Array.prototype.slice.call(arguments, 1);

        return str.replace(/\{\{|\}\}|\{(\w+)\}/g, function (m, n) {
            if (m == '{{') {
                return '{';
            }
            if (m == '}}') {
                return '}';
            }
            return col[n];
        });
    }

    // trim('000abcd000')       >>>     abcd
    static trim(str, chars) {
        return TheobaldYunioClient.ltrim(TheobaldYunioClient.rtrim(str, chars), chars);
    }

    // ltrim('000abcd') >>> abcd
    static ltrim(str, chars) {
        chars = chars || '\\s';
        return str.replace(new RegExp('^[' + chars + ']+', 'g'), '');
    }

    // rtrim('abcd0000') >>> abcd
    static rtrim(str, chars) {
        chars = chars || '\\s';
        return str.replace(new RegExp('[' + chars + ']+$', 'g'), '');
    }

    // padLeft('A', 8, '0')     >>>     00000A
    // 1 parameter - string
    // 2 parameter - pad digit count
    // 3 parameter - pad chat, e.g. '0'. Default - space ' '.
    static padLeft(str, l, c) {
        // implicit conversion for e.g. numbers
        const
            strString = str + '',
            len = l - strString.length + 1;
        return len > 0 ? Array(len).join(c || ' ') + strString : strString;
    };

    // padRight('abcd')     >>>     abcd000
    static padRight(str, l, c) {
        var strString = str + '';
        return strString + Array(l - strString.length + 1).join(c || ' ');
    };

    /** Returns SAP date string */
    static dateToString(date) {
        if (!date.getFullYear) {
            console.warn('not a date %o', date);
            return date;
        }
        return '' + date.getFullYear() +
            (constants.charZero + (date.getMonth() + 1)).slice(-2) +
            (constants.charZero + date.getDate()).slice(-2);
    };

    /** returns Date object */
    static parseSapDate(date) {
        if (typeof date !== 'string') {
            return date;
        }
        return new Date(date.substring(0, 3), parseInt(date.substring(4, 5)) - 1, date.substring(6, 7));
    };

    static preprocessResult(preprocessor, data) {
        let result = data;

        if (!!preprocessor) {
            if (preprocessor instanceof Function) {
                result = preprocessor(result);
            } else {
                // object ob array
                for (const i in preprocessor) {
                    result = preprocessor[i](result);
                }
            }
        }

        return result;
    };
    //
    // #endregion string formatters
    //

    //
    //#region network
    //
    /** servicePath=serviceName currently. Has precedence over direct url in the connection object */
    static #getServiceUrl(serverUrl, servicePath) {
        let url,
            pathname;

        try {
            url = new URL(serverUrl);
            pathname = url.pathname;
            pathname = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
        }
        catch (e) {
            if (e instanceof TypeError) {
                console.warn(`YUNIOJS: '${serverUrl}' is not a valid URL. Please use format: 'https://your-yunio-endpoint.com:8175/'`);
                return null;
            }

            throw (e);
        }

        if (servicePath) {
            url.pathname = `${pathname}/services/${servicePath}`;
        } else if (pathname.split('/').length < 3) {
            console.warn('YUNIOJS: servicePath is required. Use either full URL in the connection object or pass the servicePath additionally.');
            return null;
        }

        return url;
    }

    static #getAuthHeader(connection) {
        if (connection.apiKey) {
            return `Apikey ${connection.apiKey}`;
        }

        if (connection?.username && connection?.password) {
            const userPw = `${connection.username}:${connection.password}`;
            return `Basic ${btoa(userPw)}`;
        }

        return null;
    }

    static async #postData(
        connection,
        serviceName = null,
        // const stream = new ReadableStream()
        // default - not chunked
        data = {},
        // e.g. different users.
        auth = null
    ) {
        if (!connection) {
            throw Error("The 'connection' object must be present.");
        }

        if (!connection.url) {
            if (connection.useSharepointSettings) {
                const spSettings = await TheobaldYunioClient.getYunioSettingsFromSharePoint();
                if (!spSettings.url)
                    throw Error("yunIO server URL not found in the SharePoint. Please save the URL first or provide 'connection.url' directly.");

                connection.url = spSettings.url;

                if (!spSettings.apiKey) {
                    console.warn("Couldn't retreive apiKey from SharePoint. Please save the apiKey first or provide 'connection.apiKey' directly.");
                } else {
                    connection.apiKey = spSettings.apiKey;
                }
            } else {
                throw Error("The 'connection' object must contain the 'url' of the yunIO service. connection: { url: 'https://your-yunio-url.com:8175 }'}");
            }
        }

        const
            serviceUrl = TheobaldYunioClient.#getServiceUrl(connection.url, serviceName),
            authFinal = auth || TheobaldYunioClient.#getAuthHeader(connection),
            fetchOptions = {
                method: 'POST', // *GET, POST, PUT, DELETE, etc.
                //mode: 'cors', // no-cors, *cors, same-origin
                // cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
                // credentials: 'include', // include, *same-origin, omit
                headers: {
                    'Content-Type': 'application/json'
                    // ,
                    // 'Accept': 'application/json'
                },
                // redirect: 'follow', // manual, *follow, error
                // referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
                body: JSON.stringify(data) // body data type must match "Content-Type" header
            };



        if (authFinal) {
            fetchOptions.headers.authorization = authFinal;
        }

        const response = await fetch(serviceUrl, fetchOptions);

        // const reader = response.body
        //     .pipeThrough(new TextDecoderStream())
        //     .getReader();

        //     while (true) {
        //         const { value, done } = await reader.read();
        //         if (done) break;
        //         console.log('Received', value);
        //       }
        // let trace = response.json();
        // console.log(trace);

        return await response.json(); // parses JSON response into native JavaScript objects
    }
    //
    //#endregion Network
    //
    //
    // APIs
    //
    /**
    tableServiceParameters: {
        whereClause: "x"
    }
    */
    static executeTableServiceAsync(
        // url, auth
        connection,
        // could be specified here or directly in the connection URL.
        tableServiceName = null,
        // could be a plain whereClause
        tableServiceParameters = null
    ) {
        let tableData;

        if (tableServiceParameters) {
            const typeOfParameters = typeof tableServiceParameters;
            if (typeOfParameters === "string") {
                tableData = {
                    whereClause: tableServiceParameters
                };
            } else if (typeOfParameters === "object") {
                if (tableServiceParameters.whereClause) {
                    tableData = {
                        whereClause: tableServiceParameters.whereClause
                    };
                }
            }
        }

        return TheobaldYunioClient.#postData(connection, tableServiceName, tableData);
    }

    static executeFunctionServiceAsync(
        connection,
        functionServiceNameOrPath = null,
        functionServiceParameters = null
    ) {
        // process functionServiceParameters before sending.
        //
        return TheobaldYunioClient.#postData(connection, functionServiceNameOrPath, functionServiceParameters);
    }
    //
    //#endregion APIs
    //

    //
    //#region UI API / Combobox
    //
    /* 
    initializeLiveCombobox({
        controls: {
           inputId: "",
           selectId: "",
           outputId: "",
           // 'textId' is obsolete and will be removed. Use 'descriptionId' instead!
           descriptionId: "",
           additionalInfoId: "",
           buttonId: "" 
        },
        tableSettings: { 
            serviceName: "KNA1_Service",
            idField: "KUNNR",
            descriptionField: "NAME1",
            additionalInfoField: "NAME2"
            // optional
            // languageField: "SPRAS",
            // will be added as SPRAS = {0}
            // E.g. default LANG data type: 1 char!
            language: "E"
        },
        searchOptions: {
           // input
           useUppercaseValuesForQueries: true,
           // output
           removeLeadingZerosFromNumbers: false,
           // translated strings
           //german: true,
           //
           // not for public api.
           //
           //strings: null,
           // must/should be done via service-config.
           //maxEntries: 5000
           // will be replaced through parameter backend
           //whereClause: "", 
           //whereClauseFormat: ""
        },
        connection: {
            url: "https://your-yunio-endpoint.com:8175/",
            // in milliseconds
            //
            timeout: 30000,
            // not yet implemented
            //apiKey: "",
            username: "",
            password: ""
            // useSharepointSettings: true
        }
    })
    */
    static #validateLiveComboboxOptionsAndGetDomControls(options, validationObject) {
        if (!options) {
            console.error("YunioJS: options must be defined (table and ui-controls information)");
            return false;
        }

        // TODO: could be extended to checking on init.
        if (!options.connection) {
            console.error("YunioJS: Please set the connection to your yunIO system. (options: {connection: {url: 'xyz'})");
            return false;
        }

        if (!window.$ && !options.$) {
            console.error("YunioJS: Please set the jQuery instance for using LiveCombobox. (options: {$ = NWA$})");
            return false;
        }

        const $ = window.$ || options.$;

        const controls = options.controls;

        if (!controls) {
            console.error("YunioJS: controls not defined. Please use initializeLiveCombobox({controls: {xx}})");
            return false;
        }

        if (!controls.inputId) {
            console.error(`YunioJS: input field id for searching must be defined 'controls.inputId'.`);
            return false;
        }

        if (!controls.selectId) {
            console.error(`YunioJS: combobox id for searching must be defined 'controls.selectId'.`);
            return false;
        }

        if (!controls.outputId) {
            console.error(`YunioJS: output field id for saving a selected item must be defined 'controls.outputId'.`);
            return false;
        }

        if (controls.textId) {
            // backward compatible
            controls.descriptionId = controls.textId;
        }

        validationObject.domControls = {
            tsInput: $(`#${controls.inputId}`),
            tsSelect: $(`#${controls.selectId}`),
            tsOutputId: $(`#${controls.outputId}`),
            tsInputDescription: controls.descriptionId ? $(`#${controls.descriptionId}`) : null,
            tsAdditionalInfo: controls.additionalInfoId ? $(`#${controls.additionalInfoId}`) : null,
            tsButton: controls.buttonId ? $(`#${controls.buttonId}`) : null
        }

        const domControls = validationObject.domControls;

        if (domControls.tsInput.length != 1) {
            console.error(`YunioJS: input for search not found under id '${controls.inputId}'. For NintexForms use variables - 'inputId: myInputId' - without quotes.`);
            return false;
        }

        if (domControls.tsSelect.length != 1) {
            console.error(`YunioJS: combobox for search not found under id '${controls.selectId}'. For NintexForms use variables - 'selectId: mySelectId' - without quotes.`);
            return false;
        }

        if (domControls.tsOutputId.length != 1) {
            console.error(`YunioJS: output field for saving the selected ID not found under id '${controls.outputId}'. For NintexForms use variables - 'outputId: myOutputId' - without quotes.`);
            return false;
        }

        // EXTRA FIELDS

        if (controls.descriptionId && domControls.tsInputDescription.length != 1) {
            console.error(`YunioJS: description field for saving the description not found under id '${controls.descriptionId}'. For NintexForms use variables - 'descriptionId: myDescriptionId' - without quotes.`);
            return false;
        }

        if (controls.additionalInfoId && domControls.tsAdditionalInfo.length != 1) {
            console.error(`YunioJS: additionalInfo field for saving the extra info not found under id '${controls.additionalInfoId}'. For NintexForms use variables - 'additionalInfoId: myAdditionalInfoId' - without quotes.`);
            return false;
        }

        if (controls.buttonId && domControls.tsButton.length != 1) {
            console.error(`YunioJS: button for triggering the search not found under id '${controls.buttonId}'. For NintexForms use variables - 'buttonId: buttonId' - without quotes.`);
            return false;
        }

        return true;
    }

    static #liveComboboxTexts = {
        // literals
        stringsEN: {
            loading: 'Loading...',
            matches: 'matches',
            noMatchText: 'No direct match!',
            noMatches: 'No matches',
            errComm: 'Communication error, please see console',
            select: 'Please select',
            type: 'Start typing in the input above'
        },
        stringsDE: {
            loading: 'Wird geladen...',
            matches: 'Treffer',
            noMatchText: 'Keine Übereinstimmung.',
            noMatches: 'Keine Treffer',
            errComm: 'Netzwerk Fehler (bitte Konsole öffnen)',
            select: 'Bitte auswählen',
            type: 'Geben Sie einen Suchbegriff ein'
        },
    }

    static #DefaultSearchOptions = {
        useUppercaseValuesForQueries: true,
        removeLeadingZerosFromNumbers: false
    }

    static initializeLiveCombobox(options) {
        const validationObject = {};

        if (!TheobaldYunioClient.#validateLiveComboboxOptionsAndGetDomControls(options, validationObject))
            return void (0);

        const
            // nintex: it could work without jquery.
            // todo: jq: clone/empty
            $ = window.$ || options.$,
            _searchOptions = TheobaldYunioClient.#cloneOptions(options.searchOptions),
            controls = options.controls,
            domControls = validationObject.domControls,
            //
            tableSettings = options.tableSettings,
            //
            // SELECT LANGUAGE
            strings = TheobaldYunioClient._extendSkipEmptyStrings(
                {},
                _searchOptions.german
                    ? TheobaldYunioClient.#liveComboboxTexts.stringsDE
                    : TheobaldYunioClient.#liveComboboxTexts.stringsEN,
                options.strings),
            //
            whereClause = TheobaldYunioClient.#getWhereClause(_searchOptions, tableSettings),
            // yunio service name
            //tableSettings.serviceName,
            //whereClause = "(MATNR LIKE '%{0}%' OR MAKTX LIKE '%{0}%' OR MAKTG LIKE '%{0}%') AND (SPRAS = 'E' OR SPRAS = 'D')",
            // DEFINE whether search queries should be send in UPPERCASE (if SAP has a field for case insensitive searches)

            // Main call            
            queryFunction = function (val) {
                const effectiveValue = _searchOptions.useUppercaseValuesForQueries ? val.toUpperCase() : val,
                    tableServiceParameters = {
                        whereClause: TheobaldYunioClient.format(whereClause, effectiveValue)
                    };

                return TheobaldYunioClient.executeTableServiceAsync(
                    options.connection,
                    tableSettings.serviceName,
                    tableServiceParameters
                );
            };

        //
        // init.
        //
        // for nintex will have a value to clone
        const tsSelect = domControls.tsSelect;
        const nintexFormsSpecialCase = tsSelect.find("option:nth-child(1)");
        const firstOption = nintexFormsSpecialCase.length > 0
            ? nintexFormsSpecialCase.clone()
            : $("<option/>");

        tsSelect[0].selectedIndex = -1;
        tsSelect.empty();
        tsSelect.append(firstOption.clone());

        function doSearch() {
            tsSelect.empty();
            const newOption = firstOption.clone();
            newOption.text(strings.loading);
            tsSelect.append(newOption);
            newOption.prop('selected', 'selected');

            // discard last queries/races
            queryFunction(domControls.tsInput.val())
                .then(
                    function (data) {
                        tsSelect.empty();
                        const newOptionAfterInput = firstOption.clone();
                        newOptionAfterInput.prop('selected', 'selected');

                        if (data.length > 0) {
                            newOptionAfterInput.text(
                                `${strings.select} (${data.length} ${strings.matches})`
                            );

                            tsSelect.append(newOptionAfterInput);

                            $.each(data, function (index, row) {
                                const $option = firstOption.clone();

                                const
                                    idFieldValueRaw = row[tableSettings.idField],

                                    idFieldValue =
                                        _searchOptions.removeLeadingZerosFromNumbers
                                            ? TheobaldYunioClient.ltrim(idFieldValueRaw, '0')
                                            : idFieldValueRaw,

                                    descriptionValue = row[tableSettings.descriptionField],
                                    additionalInfoValue = row[tableSettings.additionalInfoField];

                                const effectiveDescriptionAndAdditional =
                                    TheobaldYunioClient.#prepareDescription(
                                        descriptionValue,
                                        additionalInfoValue
                                    );

                                $option.text(
                                    `${idFieldValue}${effectiveDescriptionAndAdditional}`
                                );

                                $option.attr('tsid', idFieldValueRaw);

                                tableSettings.descriptionField
                                    && $option.attr('tsdescription', descriptionValue);

                                tableSettings.additionalInfoField
                                    && $option.attr('tsadditionalinfo', additionalInfoValue);

                                tsSelect.append($option);
                            });
                        } else {
                            newOptionAfterInput.text(strings.noMatches);
                            tsSelect.append(newOptionAfterInput);
                        }

                        tsSelect[0].selectedIndex = 0;
                    },
                    function (xhr, et) {
                        console.log(xhr, et);
                    });
        }

        if (controls.buttonId) {
            domControls.tsButton.on('click', doSearch);
        }
        else {
            // user types into input, each character triggers search (SAP query)
            domControls.tsInput.on('input', doSearch);
        }

        // when user selects an option
        tsSelect.on('change', function () {
            const selectedOption = tsSelect.find('option:selected');

            domControls.tsOutputId.val(selectedOption.attr('tsid'));

            controls.descriptionId
                && domControls.tsInputDescription.val(
                    selectedOption.attr('tsdescription')
                );

            controls.additionalInfoId
                && domControls.tsAdditionalInfo.val(
                    selectedOption.attr('tsadditionalinfo')
                );
        });
    }

    static #cloneOptions(options) {
        return TheobaldYunioClient._extendSkipEmptyStrings(
            {},
            TheobaldYunioClient.#DefaultSearchOptions,
            options
        );
    }

    // returns empty if both empty, one if one filled and both if both filled.
    static #prepareDescription(descriptionValue, additionalInfoValue) {
        const
            hasDescriptionValue
                = TheobaldYunioClient.#hasValue(descriptionValue),

            hasAdditionalInfoValue
                = TheobaldYunioClient.#hasValue(additionalInfoValue);

        let combinedArray = [];

        hasDescriptionValue &&
            combinedArray.push(descriptionValue);

        hasAdditionalInfoValue &&
            combinedArray.push(additionalInfoValue);

        return combinedArray.length == 0
            ? ''
            : ` (${combinedArray.join(' ')})`;
    }

    static #hasValue(value) {
        if (value === undefined) {
            return false;
        }

        if (typeof value === 'number') {
            // can be zero
            return true;
        }

        if (typeof value === 'string') {
            value = value.trim();
            if (value === '') {
                return false;
            }
        }

        return true;
    }

    // BUILD/PREPARE/CUSTOMIZE YOUR QUERY
    // xql query.
    // ({0} LIKE '%{{0}}' OR {1} LIKE '%{{0}}%') AND SPRAS = '{3}' 
    static #getWhereClause(_searchOptions, tableSettings) {
        const WHERE_WITHOUT_LANG = " ( {0} LIKE '%{{0}}' OR {1} LIKE '%{{0}}%' )";
        const WHERE_WITH_LANG = " ( {0} LIKE '%{{0}}' OR {1} LIKE '%{{0}}%' ) AND {2} = '{3}'";

        if (_searchOptions.whereClause)
            // pass directly
            return _searchOptions.whereClause;

        let whereClauseFormat;
        let language = null;
        let languageField = null;

        if (_searchOptions.whereClauseFormat)
            whereClauseFormat = _searchOptions.whereClauseFormat;
        else {
            if (tableSettings.language) {
                language = tableSettings.language;
                languageField = tableSettings.languageField || 'SPRAS';
                whereClauseFormat = WHERE_WITH_LANG;
            }
            else
                whereClauseFormat = WHERE_WITHOUT_LANG;
        }

        return TheobaldYunioClient.format(
            whereClauseFormat,
            tableSettings.idField,
            tableSettings.descriptionField,
            languageField,
            language
        );
    }
    //
    //#endregion UI API / Combobox
    //

    //
    // #region UI helpers
    //
    static async waitForElementByIdAsync(idSelector, attempts = 6, delay = 2000) {
        // Returns a Promise that resolves after "ms" Milliseconds
        const timer = ms => new Promise(res => setTimeout(res, ms))

        const querySelector = `#${idSelector}`;

        let attempt = 0;
        let element = document.querySelector(querySelector);

        while (!element) {
            if (attempt == attempts) {
                console.warn(`Not found an element with the id '${idSelector}' in ${attempts * delay}ms.`);
                return null;
            }

            attempt++;
            await timer(delay); // await created Promise
            element = document.querySelector(querySelector);
        }

        return element;
    }
    //
    // #endregion UI helpers
    //

    // SharePoint
    /* returns {url: 'yunio-url.com', apikey: 'yunio-api-key' } */
    static async getYunioSettingsFromSharePoint() {
        const module = await import('./theobald.yunio.sp.js')
        return await module.TheobaldYunioSharepoint.getYunioProperties();

        // module.TheobaldYunioSharepoint.getYunioProperties().then(function (spSettings) {
        //     if (spSettings.apikey) {
        //         coreApiKey = spSettings.apikey;
        //     }
        //     if (spSettings.url) {
        //         url = spSettings.url;
        //     }
        // });
    }

    //
    //#region object manipulation
    //
    // lodash assign embedded
    static #_extendInternal(object, source, guard) {
        var objectTypes = {
            'boolean': false,
            'function': true,
            'object': true,
            'number': false,
            'string': false,
            'undefined': false
        };

        var index, iterable = object,
            result = iterable;
        if (!iterable) {
            return result;
        }
        var args = arguments,
            argsIndex = 0,
            argsLength = typeof guard == 'number' ? 2 : args.length,
            callback;
        if (argsLength > 2 && typeof args[argsLength - 1] == 'function') {
            callback = args[--argsLength];
        }
        while (++argsIndex < argsLength) {
            iterable = args[argsIndex];
            if (iterable && objectTypes[typeof iterable]) {
                var ownIndex = -1,
                    ownProps = objectTypes[typeof iterable] && Object.keys(iterable),
                    length = ownProps ? ownProps.length : 0;

                while (++ownIndex < length) {
                    var callbackResult;
                    index = ownProps[ownIndex];
                    if (callback) {
                        callbackResult = callback(result[index], iterable[index], index, result, iterable);
                        if (callbackResult !== undefined) {
                            result[index] = callbackResult;
                        }
                    } else {
                        result[index] = iterable[index];
                    }
                }
            }
        }

        return result;
    }

    //
    // quick way to clone the object (when "extending" an empty object)
    static clone = function (obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /** =deepExtend */
    static _extend() {
        const args = [].slice.call(arguments);
        args.push(TheobaldYunioClient._extendFilterDeep);

        return TheobaldYunioClient.#_extendInternal.apply(this, args);
    }

    static _extendSkipEmptyStrings() {
        const args = [].slice.call(arguments);
        args.push(TheobaldYunioClient._extendFilterDeepSkipEmptyStrings);

        return TheobaldYunioClient.#_extendInternal.apply(this, args);
    }

    // "obj" will be mutated. Use ({}, object_to_copy,...) when needed.
    // Note: special constructors as "Date".
    static _merge() {
        //var self = this;
        Array.prototype.slice.call(arguments, 1).forEach(function (source) {
            if (source) {
                for (const prop in source) {
                    if (source[prop] !== null && (source[prop].constructor === Object)) {
                        if (!obj[prop] || obj[prop].constructor === Object) {
                            obj[prop] = obj[prop] || {};
                            TheobaldYunioClient._merge(obj[prop], source[prop]);
                        } else {
                            obj[prop] = source[prop];
                        }
                    } else {
                        obj[prop] = source[prop];
                    }
                }
            }
        });
        return obj;
    }

    // replace only if new parameter is valid aka not empty or undefined
    static _extendFilterDeep(receiver, mergee) { //, index, outerObj, outerSrc
        // deep extend
        if (typeof receiver === 'object' && typeof mergee === 'object') {
            return TheobaldYunioClient.#_extendInternal(receiver, mergee, TheobaldYunioClient._extendFilterDeep);
        }
        // types differ, override
        if (mergee !== undefined) {
            return mergee;
        }
        if (receiver !== undefined) {
            return receiver;
        }
        // skip setting property, which is undefined in mergee and doesn't exist in receiver
        return undefined;
    }

    static _extendFilterDeepSkipEmptyStrings(receiver, mergee) {
        // deep extend
        if (typeof receiver === 'object' && typeof mergee === 'object') {
            return TheobaldYunioClient.#_extendInternal(receiver, mergee, TheobaldYunioClient._extendFilterDeepSkipEmptyStrings);
        }
        // types differ, override
        if (mergee !== undefined) {
            // mergee === 0, receiver === 1 >> will be replaced,
            // mergee === true, receiver === false >> will be replaced
            // mergee === "", receiver === "x" >> will NOT be replaced
            if (mergee === '' && (receiver !== undefined || receiver !== null)) {
                return receiver;
            }

            return mergee;
        }

        return receiver;

        // skip setting property, which is undefined in mergee and doesn't exist in receiver
        //return undefined;
    }
    //
    //#endregion object manipulation
    //
}
