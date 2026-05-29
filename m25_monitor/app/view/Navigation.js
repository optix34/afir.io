/**
 * Navigation.js — левая панель навигации (дерево) для M25 Monitor.
 * Загружает данные из /ax/tree.php, фильтрует объекты с оборудованием M25,
 * строит иерархическое дерево. При выборе транспортного средства уведомляет MainPanel.
 *
 * @class Store.m25_monitor.view.Navigation
 * @extends Pilot.utils.LeftBarPanel
 */
Ext.define('Store.m25_monitor.view.Navigation', {
    extend: 'Pilot.utils.LeftBarPanel',
    alias: 'widget.m25monitor-navigation',

    title: l('M25 Monitor'),
    iconCls: 'fa fa-microchip',
    iconAlign: 'top',
    minimized: true,
    layout: 'fit',

    /**
     * Ссылка на главную панель (MainPanel), будет установлена из Module.js
     * @property {Ext.panel.Panel} mainPanel
     */
    mainPanel: null,

    initComponent: function() {
        this.items = this.createTreePanel();
        this.callParent(arguments);
        // Загружаем данные после создания компонента
        this.loadData();
    },

    /**
     * Создаёт TreePanel с тремя колонками (Объект, IMEI, Оборудование)
     * @return {Ext.tree.Panel}
     */
    createTreePanel: function() {
        var me = this;

        // Хранилище дерева (изначально пустое)
        this.treeStore = Ext.create('Ext.data.TreeStore', {
            root: {
                text: l('M25 Devices'),
                expanded: true,
                children: []
            }
        });

        var tree = Ext.create('Ext.tree.Panel', {
            store: this.treeStore,
            rootVisible: true,
            useArrows: true,
            columns: [
                {
                    xtype: 'treecolumn',
                    text: l('Объект'),
                    dataIndex: 'text',
                    flex: 2,
                    sortable: true
                },
                {
                    text: l('IMEI'),
                    dataIndex: 'imei',
                    flex: 1,
                    sortable: true,
                    renderer: function(value) {
                        return value || '—';
                    }
                },
                {
                    text: l('Оборудование'),
                    dataIndex: 'equipment',
                    flex: 1.5,
                    sortable: true,
                    renderer: function(value) {
                        return value || '—';
                    }
                }
            ],
            listeners: {
                selectionchange: function(sm, selected) {
                    if (selected && selected.length) {
                        var record = selected[0];
                        if (record.get('type') === 'veh') {
                            me.onVehicleSelect(record);
                        }
                    }
                },
                itemdblclick: function(view, record) {
                    if (record.get('type') === 'veh') {
                        me.onVehicleSelect(record);
                    }
                },
                scope: me
            }
        });

        return tree;
    },

    /**
     * Загружает данные через /ax/tree.php и фильтрует их
     */
    loadData: function() {
        var me = this;

        Ext.Ajax.request({
            url: '/ax/tree.php',
            params: {
                vehs: 1,
                state: 1
            },
            success: function(response) {
                try {
                    var data = Ext.decode(response.responseText);
                    // Диагностика: выводим структуру первого узла для отладки
                    if (data && data.length) {
                        console.log('[M25] Raw tree data sample (first node):', data[0]);
                        console.log('[M25] Keys in first node:', Object.keys(data[0]));
                    } else {
                        console.warn('[M25] Empty response from /ax/tree.php');
                    }

                    if (!data || !data.length) {
                        Ext.Msg.alert(l('Ошибка'), l('Пустой ответ от PILOT.'));
                        return;
                    }

                    var filtered = me.filterM25Nodes(data);
                    console.log('[M25] Filtered vehicles count:', filtered.length);

                    me.treeStore.setRoot({
                        text: l('M25 Devices'),
                        expanded: true,
                        children: filtered
                    });

                    if (filtered.length === 0) {
                        Ext.Msg.alert(l('Информация'), l('Объекты с оборудованием M25 не найдены. Проверьте консоль (F12) для деталей.'));
                    }
                } catch (e) {
                    console.error('[M25] Parse error', e);
                    Ext.Msg.alert(l('Ошибка'), l('Некорректный ответ сервера.'));
                }
            },
            failure: function(response) {
                console.error('[M25] AJAX error', response.status);
                Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить данные. Статус: ' + response.status));
            },
            scope: me
        });
    },

    /**
     * Рекурсивно фильтрует дерево, оставляя только группы, содержащие M25-объекты,
     * и сами объекты с оборудованием M25.
     * @param {Array} nodes - массив узлов (группы и транспортные средства)
     * @return {Array} отфильтрованный массив узлов для TreeStore
     */
    filterM25Nodes: function(nodes) {
        var result = [];
        var me = this;

        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            var equipment = me.extractEquipment(node);
            var hasM25 = equipment && equipment.toLowerCase().indexOf('m25') !== -1;

            if (isVehicle && hasM25) {
                // Транспортное средство с M25 – добавляем
                result.push(me.normalizeVehicle(node, equipment));
            } else if (node.children && node.children.length) {
                // Это группа – обрабатываем детей
                var filteredChildren = me.filterM25Nodes(node.children);
                if (filteredChildren.length) {
                    result.push(me.normalizeGroup(node, filteredChildren));
                }
            }
        });
        return result;
    },

    /**
     * Извлекает значение оборудования (модель трекера) из узла.
     * Пробует несколько возможных имён полей.
     * @param {Object} node - узел из /ax/tree.php
     * @return {string} значение поля или пустая строка
     */
    extractEquipment: function(node) {
        // Приоритетные названия поля с моделью трекера
        var candidates = ['equipment', 'model', 'device', 'hardware', 'devicetype', 'tracker'];
        for (var i = 0; i < candidates.length; i++) {
            var val = node[candidates[i]];
            if (val !== undefined && val !== null && typeof val === 'string') {
                return val;
            }
        }
        // Если не нашли, ищем в любом строковом поле, содержащем "equip" или "device" (регистронезависимо)
        for (var key in node) {
            if (typeof node[key] === 'string') {
                var lowerKey = key.toLowerCase();
                if (lowerKey.indexOf('equip') !== -1 || lowerKey.indexOf('device') !== -1) {
                    return node[key];
                }
            }
        }
        return '';
    },

    /**
     * Преобразует узел транспортного средства в формат для TreeStore
     * @param {Object} vehNode - исходный узел
     * @param {string} equipment - извлечённое значение оборудования
     * @return {Object} узел для дерева
     */
    normalizeVehicle: function(vehNode, equipment) {
        return {
            text: vehNode.text || vehNode.name || l('Без имени'),
            vehid: vehNode.vehid,
            imei: vehNode.imei || '',
            equipment: equipment,
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car'
        };
    },

    /**
     * Преобразует узел группы (папки) в формат для TreeStore
     * @param {Object} groupNode - исходный узел группы
     * @param {Array} children - отфильтрованные дочерние узлы
     * @return {Object} узел группы для дерева
     */
    normalizeGroup: function(groupNode, children) {
        return {
            text: groupNode.text || groupNode.name || l('Папка'),
            type: 'group',
            leaf: false,
            expanded: false,
            children: children
        };
    },

    /**
     * Обработчик выбора транспортного средства.
     * Передаёт URL в MainPanel для загрузки в iframe.
     * @param {Ext.data.NodeInterface} record - выбранная запись
     */
    onVehicleSelect: function(record) {
        if (!this.mainPanel) {
            console.warn('[M25] No mainPanel reference in Navigation');
            return;
        }

        var vehid = record.get('vehid');
        var vehicleName = record.get('text');
        var baseUrl = 'https://mega-info.su/dealer2/';
        var url = baseUrl;

        if (vehid) {
            // Добавляем параметр vehicle_id (если сайт его поддерживает)
            url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);
        }

        // Если MainPanel имеет метод loadUrl – используем его, иначе пробуем прямой iframe
        if (Ext.isFunction(this.mainPanel.loadUrl)) {
            this.mainPanel.loadUrl(url, vehicleName);
        } else if (this.mainPanel.iframe && this.mainPanel.iframe.getIframeDom) {
            var iframeDom = this.mainPanel.iframe.getIframeDom();
            if (iframeDom) {
                iframeDom.src = url;
                this.mainPanel.currentIframeSrc = url;
            }
            var infoText = this.mainPanel.down('#infoText');
            if (infoText) {
                infoText.update('<span style="color:#2563eb;">' + l('Текущий объект: ') + Ext.String.htmlEncode(vehicleName) + '</span>');
            }
        } else {
            console.error('[M25] Cannot load URL – MainPanel does not support loadUrl or iframe access');
        }
    },

    /**
     * Устанавливает ссылку на главную панель (вызывается из Module.js)
     * @param {Ext.panel.Panel} panel
     */
    setMainPanel: function(panel) {
        this.mainPanel = panel;
    }
});
