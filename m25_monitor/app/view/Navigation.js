/**
 * Navigation.js — левая панель навигации с фильтрацией M25
 * Исправленная версия с улучшенной диагностикой и гибким поиском поля оборудования.
 */
Ext.define('Store.m25_monitor.view.Navigation', {
    extend: 'Pilot.utils.LeftBarPanel',
    alias: 'widget.m25monitor-navigation',

    title: l('M25 Monitor'),
    iconCls: 'fa fa-microchip',
    icon/**
 * Navigation.js — левая панель навигации с загрузкой через API vehicles
 * Использует /backend/api.php?cmd=vehicles для получения полных данных об объектах.
 * Фильтрует по полю configuration (или model, device) на наличие "M25".
 * Строит иерархическое дерево на основе поля folder.
 */
Ext.define('Store.m25_monitor.view.Navigation', {
    extend: 'Pilot.utils.LeftBarPanel',
    alias: 'widget.m25monitor-navigation',

    title: l('M25 Monitor'),
    iconCls: 'fa fa-microchip',
    iconAlign: 'top',
    minimized: true,
    layout: 'fit',

    mainPanel: null,

    // Хранилище параметров аккаунта
    accountId: null,
    node: null,

    initComponent: function() {
        this.items = this.createTreePanel();
        this.callParent(arguments);
        // Запускаем процесс загрузки данных
        this.initAccountAndLoad();
    },

    createTreePanel: function() {
        var me = this;
        var store = Ext.create('Ext.data.TreeStore', {
            root: {
                text: l('M25 Devices'),
                expanded: true,
                children: []
            }
        });
        this.treeStore = store;

        var tree = Ext.create('Ext.tree.Panel', {
            store: store,
            rootVisible: true,
            useArrows: true,
            columns: [
                { xtype: 'treecolumn', text: l('Объект'), dataIndex: 'text', flex: 2, sortable: true },
                { text: l('IMEI'), dataIndex: 'imei', flex: 1, sortable: true, renderer: function(v) { return v || '—'; } },
                { text: l('Оборудование'), dataIndex: 'equipment', flex: 1.5, sortable: true, renderer: function(v) { return v || '—'; } }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length) {
                        var node = selected[0];
                        if (node.get('type') === 'veh') me.onVehicleSelect(node);
                    }
                },
                itemdblclick: function(view, record) {
                    if (record.get('type') === 'veh') me.onVehicleSelect(record);
                },
                scope: me
            }
        });
        return tree;
    },

    /**
     * Определяет account_id и node из глобальных объектов PILOT или запросом.
     */
    initAccountAndLoad: function() {
        var me = this;

        // Пробуем взять из skeleton.user
        if (window.skeleton && skeleton.user) {
            if (skeleton.user.account_id) {
                me.accountId = skeleton.user.account_id;
                me.node = skeleton.user.node || 1;
                console.log('M25 Monitor: account_id и node получены из skeleton.user', me.accountId, me.node);
                me.loadVehicles();
                return;
            }
        }

        // Пробуем из skeleton.account
        if (window.skeleton && skeleton.account) {
            if (skeleton.account.account_id) {
                me.accountId = skeleton.account.account_id;
                me.node = skeleton.account.node || 1;
                console.log('M25 Monitor: account_id и node получены из skeleton.account', me.accountId, me.node);
                me.loadVehicles();
                return;
            }
        }

        // Если нет — делаем запрос /ax/account_info.php
        Ext.Ajax.request({
            url: '/ax/account_info.php',
            method: 'GET',
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    if (data && data.account_id) {
                        me.accountId = data.account_id;
                        me.node = data.node || 1;
                        console.log('M25 Monitor: account_id и node получены из /ax/account_info.php', me.accountId, me.node);
                        me.loadVehicles();
                    } else {
                        Ext.Msg.alert(l('Ошибка'), l('Не удалось определить account_id. Проверьте авторизацию.'));
                    }
                } catch(e) {
                    console.error('M25 Monitor: ошибка парсинга account_info', e);
                    Ext.Msg.alert(l('Ошибка'), l('Не удалось получить данные аккаунта.'));
                }
            },
            failure: function(response) {
                console.error('M25 Monitor: ошибка запроса account_info', response.status);
                Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить информацию об аккаунте.'));
            },
            scope: me
        });
    },

    /**
     * Загружает список транспортных средств через /backend/api.php?cmd=vehicles
     */
    loadVehicles: function() {
        var me = this;

        Ext.Ajax.request({
            url: '/backend/api.php',
            params: {
                cmd: 'vehicles',
                account_id: me.accountId,
                node: me.node,
                is_show_deleted: 0
            },
            success: function(response) {
                try {
                    var result = Ext.decode(response.responseText);
                    console.log('M25 Monitor: ответ /backend/api.php?cmd=vehicles', result);

                    if (!result || !result.data || !Ext.isArray(result.data)) {
                        console.warn('M25 Monitor: некорректный формат ответа vehicles');
                        Ext.Msg.alert(l('Ошибка'), l('Некорректный ответ от API транспортных средств.'));
                        return;
                    }

                    // Фильтруем объекты с оборудованием M25
                    var m25Vehicles = [];
                    Ext.each(result.data, function(vehicle) {
                        var equipment = me.getEquipmentFromVehicle(vehicle);
                        if (equipment && equipment.toLowerCase().indexOf('m25') !== -1) {
                            m25Vehicles.push(me.normalizeVehicleFromApi(vehicle, equipment));
                        }
                    });

                    console.log('M25 Monitor: найдено M25-объектов:', m25Vehicles.length);

                    // Строим иерархическое дерево на основе поля folder
                    var treeData = me.buildTreeFromFlatList(m25Vehicles);

                    me.treeStore.setRoot({
                        text: l('M25 Devices'),
                        expanded: true,
                        children: treeData
                    });

                    if (m25Vehicles.length === 0) {
                        Ext.Msg.alert(l('Информация'), l('Объекты с оборудованием M25 не найдены. Проверьте консоль (F12) для деталей.'));
                    }
                } catch (e) {
                    console.error('M25 Monitor: ошибка обработки ответа vehicles', e);
                    Ext.Msg.alert(l('Ошибка'), l('Ошибка при обработке данных объектов.'));
                }
            },
            failure: function(response) {
                console.error('M25 Monitor: ошибка запроса vehicles', response.status);
                Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить список объектов. Статус: ' + response.status));
            },
            scope: me
        });
    },

    /**
     * Извлекает модель оборудования из объекта vehicle.
     * Пробует поля: configuration, model, device, equipment, devicetype.
     */
    getEquipmentFromVehicle: function(vehicle) {
        var candidates = ['configuration', 'model', 'device', 'equipment', 'devicetype', 'hardware'];
        for (var i = 0; i < candidates.length; i++) {
            var val = vehicle[candidates[i]];
            if (val && typeof val === 'string') return val;
        }
        return '';
    },

    /**
     * Нормализует объект из API vehicles в формат для дерева.
     */
    normalizeVehicleFromApi: function(vehicle, equipment) {
        return {
            id: vehicle.id || vehicle.vehicle_id,
            text: vehicle.vehiclenumber || vehicle.name || l('Без имени'),
            vehid: vehicle.vehicle_id || vehicle.id,
            imei: vehicle.uniqid || vehicle.imei || '',
            equipment: equipment,
            folder: vehicle.folder || '',
            parent_id: vehicle.parent_id || null,
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car'
        };
    },

    /**
     * Строит иерархическое дерево из плоского списка объектов,
     * группируя по полю folder (или parent_id).
     * Простая реализация: разбивает folder по '/' и создаёт вложенные группы.
     */
    buildTreeFromFlatList: function(vehicles) {
        var rootChildren = [];
        var groupsMap = {}; // key: путь папки, значение: узел группы

        // Сортируем объекты по folder (чтобы группы создавались до элементов)
        vehicles.sort(function(a, b) {
            return (a.folder || '').localeCompare(b.folder || '');
        });

        Ext.each(vehicles, function(vehicle) {
            var folderPath = vehicle.folder || '';
            if (!folderPath) {
                // Без папки — сразу в корень
                rootChildren.push(vehicle);
                return;
            }

            // Разбиваем путь на части, например "Группа1/Подгруппа2"
            var parts = folderPath.split('/');
            var currentPath = '';
            var parentArray = rootChildren;
            var parentNode = null;

            for (var i = 0; i < parts.length; i++) {
                var part = parts[i];
                if (!part) continue;
                currentPath += (currentPath ? '/' : '') + part;

                if (!groupsMap[currentPath]) {
                    // Создаём новую группу
                    var groupNode = {
                        text: part,
                        type: 'group',
                        leaf: false,
                        expanded: false,
                        children: [],
                        path: currentPath
                    };
                    groupsMap[currentPath] = groupNode;
                    parentArray.push(groupNode);
                }
                // Переходим внутрь группы
                parentArray = groupsMap[currentPath].children;
            }
            // Добавляем vehicle в последнюю группу
            parentArray.push(vehicle);
        });

        return rootChildren;
    },

    onVehicleSelect: function(record) {
        if (!this.mainPanel) return;

        var vehid = record.get('vehid');
        var vehicleName = record.get('text');
        var baseUrl = 'https://mega-info.su/dealer2/';
        var url = baseUrl;
        if (vehid) {
            url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);
        }

        if (this.mainPanel.loadUrl) {
            this.mainPanel.loadUrl(url, vehicleName);
        } else if (this.mainPanel.iframe && this.mainPanel.iframe.getIframeDom) {
            var iframeDom = this.mainPanel.iframe.getIframeDom();
            if (iframeDom) iframeDom.src = url;
            var infoText = this.mainPanel.down('#infoText');
            if (infoText) {
                infoText.update('<span style="color:#2563eb;">' + l('Текущий объект: ') + Ext.String.htmlEncode(vehicleName) + '</span>');
            }
        }
    },

    setMainPanel: function(panel) {
        this.mainPanel = panel;
    }
});
    layout: 'fit',

    mainPanel: null,

    initComponent: function() {
        this.items = this.createTreePanel();
        this.callParent(arguments);
    },

    createTreePanel: function() {
        var me = this;

        var store = Ext.create('Ext.data.TreeStore', {
            root: {
                text: l('M25 Devices'),
                expanded: true,
                children: []
            }
        });

        me.loadM25Tree(store);

        var tree = Ext.create('Ext.tree.Panel', {
            store: store,
            rootVisible: true,
            useArrows: true,
            columns: [
                { xtype: 'treecolumn', text: l('Объект'), dataIndex: 'text', flex: 2, sortable: true },
                { text: l('IMEI'), dataIndex: 'imei', flex: 1, sortable: true, renderer: function(v) { return v || '—'; } },
                { text: l('Оборудование'), dataIndex: 'equipment', flex: 1.5, sortable: true, renderer: function(v) { return v || '—'; } }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length) {
                        var node = selected[0];
                        if (me.isVehicleNode(node)) me.onVehicleSelect(node);
                    }
                },
                itemdblclick: function(view, record) {
                    if (me.isVehicleNode(record)) me.onVehicleSelect(record);
                },
                scope: me
            }
        });
        return tree;
    },

    /**
     * Загружает /ax/tree.php, логирует структуру, фильтрует M25
     */
    loadM25Tree: function(store) {
        var me = this;

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: { vehs: 1, state: 1 },
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    console.log('M25 Monitor: получен ответ от /ax/tree.php', data);

                    if (!data || !data.length) {
                        Ext.Msg.alert(l('Ошибка'), l('Пустой ответ от PILOT.'));
                        return;
                    }

                    // Показываем в консоли первый элемент для анализа полей
                    if (data[0]) {
                        console.log('M25 Monitor: пример первого узла:', data[0]);
                        console.log('M25 Monitor: имена полей:', Object.keys(data[0]));
                    }

                    var filtered = me.filterM25Nodes(data);
                    console.log('M25 Monitor: отфильтровано узлов (M25):', filtered.length);

                    store.setRoot({
                        text: l('M25 Devices'),
                        expanded: true,
                        children: filtered
                    });

                    if (filtered.length === 0) {
                        Ext.Msg.alert(l('Информация'), l('Объекты с оборудованием M25 не найдены. Проверьте консоль (F12) для деталей.'));
                    }
                } catch (e) {
                    console.error('M25 Monitor: ошибка парсинга', e);
                    Ext.Msg.alert(l('Ошибка'), l('Некорректный ответ сервера.'));
                }
            },
            failure: function(response) {
                console.error('M25 Monitor: ошибка запроса', response.status);
                Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить данные. Статус: ' + response.status));
            },
            scope: me
        });
    },

    /**
     * Рекурсивная фильтрация с гибким определением транспортных средств и поля оборудования
     */
    filterM25Nodes: function(nodes) {
        var result = [];
        var me = this;

        Ext.Array.each(nodes, function(node) {
            // Определяем, является ли узел транспортным средством
            var isVehicle = me.isVehicleNode(node);
            // Ищем поле, содержащее модель оборудования (пробуем несколько вариантов)
            var equipmentValue = me.getEquipmentField(node);
            var hasM25 = equipmentValue && equipmentValue.toLowerCase().indexOf('m25') !== -1;

            if (isVehicle) {
                if (hasM25) {
                    result.push(me.normalizeVehicleNode(node, equipmentValue));
                }
            } else {
                // Узел-группа: обрабатываем детей
                var children = node.children || node.nodes || node.items || [];
                var filteredChildren = me.filterM25Nodes(children);
                if (filteredChildren.length > 0) {
                    var groupNode = me.normalizeGroupNode(node);
                    groupNode.children = filteredChildren;
                    result.push(groupNode);
                }
            }
        });
        return result;
    },

    /**
     * Проверяет, является ли узел транспортным средством.
     * Критерии: есть vehid ИЛИ (нет children и type === 'veh' или type === 'vehicle' или отсутствует type)
     */
    isVehicleNode: function(node) {
        if (node.vehid) return true;
        if (node.type === 'veh' || node.type === 'vehicle') return true;
        // Если нет дочерних узлов и есть id/name — вероятно, транспорт
        var hasNoChildren = !node.children || node.children.length === 0;
        if (hasNoChildren && (node.id || node.vehid)) return true;
        return false;
    },

    /**
     * Извлекает значение оборудования из узла, пробуя разные имена полей.
     */
    getEquipmentField: function(node) {
        // Возможные названия поля с моделью трекера
        var possibleFields = ['equipment', 'device', 'hardware', 'model', 'devicetype', 'tracker'];
        for (var i = 0; i < possibleFields.length; i++) {
            var fieldName = possibleFields[i];
            if (node[fieldName] !== undefined && node[fieldName] !== null) {
                return String(node[fieldName]);
            }
        }
        // Если ничего не нашли, пробуем поискать в любом строковом поле
        for (var key in node) {
            if (typeof node[key] === 'string' && (key.toLowerCase().indexOf('equip') !== -1 || key.toLowerCase().indexOf('device') !== -1)) {
                return node[key];
            }
        }
        return '';
    },

    normalizeVehicleNode: function(vehNode, equipmentValue) {
        return {
            text: vehNode.text || vehNode.name || l('Без имени'),
            vehid: vehNode.vehid,
            imei: vehNode.imei || '',
            equipment: equipmentValue,
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car'
        };
    },

    normalizeGroupNode: function(groupNode) {
        return {
            text: groupNode.text || groupNode.name || l('Папка'),
            type: 'group',
            leaf: false,
            expanded: false,
            children: []
        };
    },

    onVehicleSelect: function(record) {
        if (!this.mainPanel) return;
        var vehid = record.get('vehid');
        var vehicleName = record.get('text');
        var url = 'https://mega-info.su/dealer2/';
        if (vehid) {
            url += (url.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);
        }
        if (this.mainPanel.loadUrl) {
            this.mainPanel.loadUrl(url, vehicleName);
        } else if (this.mainPanel.iframe && this.mainPanel.iframe.getIframeDom) {
            var iframeDom = this.mainPanel.iframe.getIframeDom();
            if (iframeDom) iframeDom.src = url;
            var infoText = this.mainPanel.down('#infoText');
            if (infoText) infoText.update('<span style="color:#2563eb;">' + l('Текущий объект: ') + Ext.String.htmlEncode(vehicleName) + '</span>');
        }
    },

    setMainPanel: function(panel) {
        this.mainPanel = panel;
    }
});
