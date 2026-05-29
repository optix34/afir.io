/**
 * Navigation.js — левая панель навигации с фильтрацией M25
 * Исправленная версия с улучшенной диагностикой и гибким поиском поля оборудования.
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
