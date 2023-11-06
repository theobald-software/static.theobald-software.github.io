// yunIO Javascript Component | (c) Theobald Software GmbH | theobald-software.com

export class TheobaldYunioClient {
    //
    // #region string formatters
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
                console.warn(`yunIO: '${serverUrl}' is not a valid URL. Please use format: 'https://your-yunio-endpoint.com:8175/'`);
                return null;
            }

            throw (e);
        }

        if (servicePath) {
            url.pathname = `${pathname}/services/${servicePath}`;
        } else if (pathname.split('/').length < 3) {
            console.warn('yunIO: servicePath is required. Use either full URL in the connection object or pass the servicePath additionally.');
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

    static async #postDataInternal(
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

        return response;
    }

    // Returns null on errors and prints errors into the console.
    // Used to satisfy interactive usages with no "container" for errors.
    static async #postData(
        connection,
        serviceName = null,
        // const stream = new ReadableStream()
        // default - not chunked
        data = {},
        // e.g. different users.
        auth = null
        //throwOnErrors = false
    ) {
        // if (throwOnErrors) this.#postDataInternal(connection, serviceName, data, auth);
        let response;

        try {
            response = await this.#postDataInternal(connection, serviceName, data, auth);
        } catch (error) {
            // Sequence contains no matching element
            console.error('yunIO: fetch/server error: ' + error?.message);
            return null;
        }

        if (!response.ok) {
            console.log(`yunIO: HTTP error, please take a look on the payload and response of the request (see the "Network" tab).`);
            return null;
        }

        try {
            return await response.json();
        } catch (error) {
            console.error('yunIO: server answered, but JSON parse failed: ' + error?.message);
            return null;
        }
    }
    //
    //#endregion Network
    //

    //
    //#region api
    //
    /**
    tableServiceParameters: {
        whereClause: "x"
    }
    */
    static async executeTableServiceAsync(
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

        return await TheobaldYunioClient.#postData(connection, tableServiceName, tableData);
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
    //#endregion api
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
           // uses additionalInfoField value to query SAP data too
           useAdditionalInfoFieldForSearch: false,
           // translated strings
           //german: true,
           //
           // not for public api.
           //
           //strings: null,
           //
           // must/should be done via service-config.
           //maxEntries: 5000,
           //
           // will be appended to the whereClause
           //extraWhereConditions: "ENDDA LIKE '99991231'"
           //
           // will be replaced through parameter backend
           //whereClause: "", 
           //
           // " ( {0} LIKE '%{{0}}' OR {1} LIKE '%{{0}}%' )"
           // {0}, {1}
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
        const
            messageLocalizations = {
                en: {
                    optionsUndefined: "yunIO: options must be defined (table and ui-controls information)",
                    connectionMissing: "yunIO: Please set the connection to your yunIO system. (options: {connection: {url: 'xyz'}})",
                    jQueryMissing: "yunIO: Please set the jQuery instance for using LiveCombobox. (options: {$ = NWA$})",
                    controlsUndefined: "yunIO: controls not defined. Please use initializeLiveCombobox({controls: {xx}})",
                    inputIdMissing: "yunIO: input field id for searching must be defined 'controls.inputId'.",
                    selectIdMissing: "yunIO: combobox id for searching must be defined 'controls.selectId'.",
                    outputIdMissing: "yunIO: output field id for saving a selected item must be defined 'controls.outputId'.",
                    // controls
                    inputSearch: 'input for search',
                    comboboxSearch: 'combobox for search',
                    outputField: 'output field for saving the selected ID',
                    descriptionField: 'description field for saving the description',
                    additionalInfoField: 'additionalInfo field for saving the extra info',
                    searchButton: 'button for triggering the search',
                    // table
                    tableIdField: "yunIO: table idField must be defined 'options: { tableSettings: { idField: 'xx' } } '",
                    notFound: (name, id) => `yunIO: ${name} not found under id '${id}'. For NintexForms use variables - '${name}: ${id}' - without quotes.`
                },
                de: {
                    optionsUndefined: "yunIO: Optionen müssen definiert werden (Informationen zu Tabelle und UI-Steuerelementen)",
                    connectionMissing: "yunIO: Bitte stellen Sie die Verbindung zu Ihrem yunIO-System ein. (Optionen: {Verbindung: {url: 'xyz'}})",
                    jQueryMissing: "yunIO: Bitte setzen Sie die jQuery-Instanz für die Verwendung von LiveCombobox. (Optionen: {$ = NWA$})",
                    controlsUndefined: "yunIO: Steuerelemente nicht definiert. Bitte verwenden Sie initializeLiveCombobox({controls: {xx}})",
                    inputIdMissing: "yunIO: Die ID des Eingabefeldes für die Suche muss definiert werden 'controls.inputId'.",
                    selectIdMissing: "yunIO: Die ID der Combobox für die Suche muss definiert werden 'controls.selectId'.",
                    outputIdMissing: "yunIO: Die ID des Ausgabefeldes zum Speichern eines ausgewählten Elements muss definiert werden 'controls.outputId'.",
                    // controls
                    inputSearch: 'Eingabefeld für die Suche',
                    comboboxSearch: 'Auswahlfeld (combobox) für die Suche',
                    outputField: 'Ausgabefeld zum Speichern der ausgewählten ID',
                    descriptionField: 'Beschreibungsfeld zum Speichern der Beschreibung',
                    additionalInfoField: 'Zusatzinformationsfeld zum Speichern weiterer Infos',
                    searchButton: 'Button zum Auslösen der Suche',
                    // table
                    tableIdField: "yunIO: idField der Tabelle muss definiert werden: 'options: { tableSettings: { idField: 'xx' } } '",
                    notFound: (name, id) => `yunIO: ${name} unter der ID '${id}' nicht gefunden. Für NintexForms verwenden Sie Variablen - '${name}: ${id}' - ohne Anführungszeichen.`
                },
            },
            messages = options?.searchOptions?.german ? messageLocalizations.de : messageLocalizations.en;

        const checkDefined = (condition, errorMessage) => {
            if (!condition) {
                console.error(errorMessage);
                alert(errorMessage);
                return false;
            }
            return true;
        };

        if (!checkDefined(options, messages.optionsUndefined)) return false;
        if (!checkDefined(options.connection, messages.connectionMissing)) return false;

        const $ = window.$ || options.$;
        if (!checkDefined($, messages.jQueryMissing)) return false;

        const controls = options.controls;
        if (!checkDefined(controls, messages.controlsUndefined)) return false;
        if (!checkDefined(controls.inputId, messages.inputIdMissing)) return false;
        if (!checkDefined(controls.selectId, messages.selectIdMissing)) return false;
        if (!checkDefined(controls.outputId, messages.outputIdMissing)) return false;

        if (controls.textId) {
            controls.descriptionId = controls.textId;
        }

        const createControlSelector = id => id ? $(`#${id}`) : null;
        const checkControlExistence = (control, name, id) => {
            if (control && control.length !== 1) {
                const msg = messages.notFound(name, id);
                
                console.error(msg);
                alert(msg);

                return false;
            }
            return true;
        };

        validationObject.domControls = {
            tsInput: createControlSelector(controls.inputId),
            tsSelect: createControlSelector(controls.selectId),
            tsOutputId: createControlSelector(controls.outputId),
            tsInputDescription: createControlSelector(controls.descriptionId),
            tsAdditionalInfo: createControlSelector(controls.additionalInfoId),
            tsButton: createControlSelector(controls.buttonId)
        };

        const { tsInput, tsSelect, tsOutputId, tsInputDescription, tsAdditionalInfo, tsButton } = validationObject.domControls;

        if (!checkControlExistence(tsInput, messages.inputSearch, controls.inputId)) return false;
        if (!checkControlExistence(tsSelect, messages.comboboxSearch, controls.selectId)) return false;
        if (!checkControlExistence(tsOutputId, messages.outputField, controls.outputId)) return false;
        if (!checkControlExistence(tsInputDescription, messages.descriptionField, controls.descriptionId)) return false;
        if (!checkControlExistence(tsAdditionalInfo, messages.additionalInfoField, controls.additionalInfoId)) return false;
        if (!checkControlExistence(tsButton, messages.searchButton, controls.buttonId)) return false;
        
        const tableSettings = options.tableSettings;
        //serviceName: "table-makt" // could be a part of the url.
        if (!tableSettings.idField) {
            console.error(messages.tableIdField);
            alert(messages.tableIdField);

            return false;
        }

        return true;
    }

    static #liveComboboxTexts = {
        // literals
        en: {
            loading: 'Loading...',
            matches: 'matches',
            noMatchText: 'No direct match!',
            noMatches: 'No matches',
            errRequest: '== Request failed, please see the console ==',
            errSvcNotFound: '== Service not found ==',
            select: 'Please select',
            type: 'Start typing in the input above'
        },
        de: {
            loading: 'Wird geladen...',
            matches: 'Treffer',
            noMatchText: 'Keine Übereinstimmung.',
            noMatches: 'Keine Treffer',
            errRequest: '== Anfrage fehlgeschlagen, bitte Konsole überprüfen ==',
            errSvcNotFound: '== WebService nicht gefunden ==',
            select: 'Bitte auswählen',
            type: 'Geben Sie einen Suchbegriff ein'
        },
    }

    static #DefaultSearchOptions = {
        useUppercaseValuesForQueries: true,
        removeLeadingZerosFromNumbers: false,
        useAdditionalInfoFieldForSearch: false
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
                    ? TheobaldYunioClient.#liveComboboxTexts.de
                    : TheobaldYunioClient.#liveComboboxTexts.en,
                options.strings),
            //
            whereClause = TheobaldYunioClient.#getWhereClause(_searchOptions, tableSettings),
            // yunio service name
            //tableSettings.serviceName,
            //whereClause = "(MATNR LIKE '%{0}%' OR MAKTX LIKE '%{0}%' OR MAKTG LIKE '%{0}%') AND (SPRAS = 'E' OR SPRAS = 'D')",
            // DEFINE whether search queries should be send in UPPERCASE (if SAP has a field for case insensitive searches)

            // Main call            
            queryFunction = async function (val) {
                const effectiveValue = _searchOptions.useUppercaseValuesForQueries ? val.toUpperCase() : val,
                    tableServiceParameters = {
                        whereClause: TheobaldYunioClient.format(whereClause, effectiveValue)
                    };

                return await TheobaldYunioClient.executeTableServiceAsync(
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

        async function doSearch() {
            tsSelect.empty();
            const newOption = firstOption.clone();
            newOption.text(strings.loading);
            tsSelect.append(newOption);
            newOption.prop('selected', 'selected');

            // discard last queries/races
            try {
                const data = await queryFunction(domControls.tsInput.val());

                tsSelect.empty();
                const newOptionAfterInput = firstOption.clone();
                newOptionAfterInput.prop('selected', 'selected');

                if (data === null) {
                    newOptionAfterInput.text(strings.errRequest);
                    tsSelect.append(newOptionAfterInput);
                    tsSelect[0].selectedIndex = 0;

                    return;
                }

                if (data.length > 0) {
                    newOptionAfterInput.text(
                        `${strings.select} (${data.length} ${strings.matches})`
                    );
                    tsSelect.append(newOptionAfterInput);

                    for (const [index, row] of data.entries()) {
                        const $option = firstOption.clone();

                        const idFieldValueRaw = row[tableSettings.idField];
                        const idFieldValue = _searchOptions.removeLeadingZerosFromNumbers
                            ? TheobaldYunioClient.ltrim(idFieldValueRaw, '0')
                            : idFieldValueRaw;

                        const descriptionValue = row[tableSettings.descriptionField];
                        const additionalInfoValue = row[tableSettings.additionalInfoField];

                        const effectiveDescriptionAndAdditional =
                            TheobaldYunioClient.#prepareDescription(
                                descriptionValue,
                                additionalInfoValue
                            );

                        $option.text(`${idFieldValue}${effectiveDescriptionAndAdditional}`);
                        $option.attr('tsid', idFieldValueRaw);

                        if (tableSettings.descriptionField) {
                            $option.attr('tsdescription', descriptionValue);
                        }

                        if (tableSettings.additionalInfoField) {
                            $option.attr('tsadditionalinfo', additionalInfoValue);
                        }

                        tsSelect.append($option);
                    }
                } else {
                    newOptionAfterInput.text(strings.noMatches);
                    tsSelect.append(newOptionAfterInput);
                }

                tsSelect[0].selectedIndex = 0;
            } catch (e) {
                // non fetch error, if any.
                console.log(e);
            }
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
    // format for the xql query.
    // {0} - idField
    // {1} - descriptionField
    // {2} - additionalInfoField
    // {3} - languageField
    // {4} - language
    // " ( {0} LIKE '%{{0}}' OR {1} LIKE '%{{0}}%' OR {2} LIKE '%{{0}}%' )" 
    static #getWhereClause(_searchOptions, tableSettings) {
        const WHERE_ID_DESCRIPTION = " ( {0} LIKE '%{{0}}' OR {1} LIKE '%{{0}}%' )";
        const WHERE_ID_DESCRIPTION_ADDITIONAL = " ( {0} LIKE '%{{0}}' OR {1} LIKE '%{{0}}%' OR {2} LIKE '%{{0}}%' )";
        const WHERE_LANG_CONDITION = " AND {3} = '{4}'";

        if (_searchOptions.whereClause)
            // pass directly
            return _searchOptions.whereClause;

        let whereClauseFormat;
        let language = null;
        let languageField = null;

        if (_searchOptions.whereClauseFormat)
            whereClauseFormat = _searchOptions.whereClauseFormat;
        else {
            whereClauseFormat =
                _searchOptions.useAdditionalInfoFieldForSearch
                    ? WHERE_ID_DESCRIPTION_ADDITIONAL
                    : WHERE_ID_DESCRIPTION;

            if (tableSettings.language) {
                language = tableSettings.language;
                languageField = tableSettings.languageField || 'SPRAS';
                whereClauseFormat = `${whereClauseFormat} ${WHERE_LANG_CONDITION}`;
            }
        }

        if (_searchOptions.extraWhereConditions) {
            whereClauseFormat =
                `${whereClauseFormat} ${_searchOptions.extraWhereConditions}`;
        }

        /* tableSettings.whereClauseFields =
          [ 
            tableSettings.idField,
            tableSettings.descriptionField,
            tableSettings.additionalInfoField,
            languageField,
            language
          ]
        */
        return TheobaldYunioClient.format(
            whereClauseFormat,
            tableSettings.idField,
            tableSettings.descriptionField,
            tableSettings.additionalInfoField,
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
