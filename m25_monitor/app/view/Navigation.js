/**
 * Navigation.js
 * Левая панель навигации расширения M25 Monitor
 * 
 * Отвечает за загрузку /ax/tree.php, фильтрацию объектов M25
 * и отображение дерева с колонками: Объект, IMEI, Оборудование.
 * 
 * @class Store.m25_monitor.view.Navigation
 * @extends Pilot.utils.LeftBarPanel
 */
Ext.define('Store.m25_monitor.view.Navigation', {
    extend: 'Pilot.utils.LeftBarPanel',
    alias: 'widget.m25monitor-navigation',

    // Обязательные параметры для вкладки
    title: l('M25 Monitor'),
    iconCls: 'fa fa-microchip',
    iconAlign: 'top',
    minimized: true,
    layout: 'fit',

    /**
     * Ссылка на главную панель (устанавливается при создании модуля)
     */
    mainPanel: null,

    initComponent: function() {
        // Создаём TreePanel с нужными колонками
        this.items = this.createTreePanel();
        this.callParent(arguments);
    },

    /**
     * Создаёт дерево с загрузкой и фильтрацией M25
     * @return {Ext.tree.Panel}
     */
    createTreePanel: function() {
        var me = this;

        // Хранилище для дерева (пока пустое, заполнится после AJAX)
        var store = Ext.create('Ext.data.TreeStore', {
            root: {
                text: l('M25 Devices'),
                expanded: true,
                children: []
            }
        });

        // Загружаем реальные данные из PILOT
        me.loadM25Tree(store);

        // Создаём панель дерева
        var tree = Ext.create('Ext.tree.Panel', {
            store: store,
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
                    if (selected && selected.length > 0) {
                        var node = selected[0];
                        // Проверяем, что выбран транспорт (не группа)
                        if (node && (node.get('type') === 'veh' || node.get('vehid'))) {
                            me.onVehicleSelect(node);
                        }
                    }
                },
                itemdblclick: function(view, record) {
                    if (record.get('type') === 'veh' || record.get('vehid')) {
                        me.onVehicleSelect(record);
                    }
                },
                scope: me
            },
            // Переопределяем иконки для узлов (опционально)
            viewConfig: {
                getRowClass: function(record) {
                    if (record.get('type') === 'veh') {
                        return 'm25-vehicle-row';
                    }
                    return '';
                }
            }
        });

        return tree;
    },

    /**
     * Загружает /ax/tree.php, фильтрует ветки с M25 и обновляет store
     * @param {Ext.data.TreeStore} store
     */
    loadM25Tree: function(store) {
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
                    if (!data || !data.length) {
                        Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить данные из PILOT. Пустой ответ.'));
                        return;
                    }

                    // Фильтруем иерархию, оставляя только M25-объекты и содержащие их группы
                    var filtered = me.filterM25Nodes(data);

                    // Устанавливаем корень дерева
                    store.setRoot({
                        text: l('M25 Devices'),
                        expanded: true,
                        children: filtered
                    });

                    if (filtered.length === 0) {
                        Ext.Msg.alert(l('Информация'), l('Объекты с оборудованием M25 не найдены.'));
                    }
                } catch (e) {
                    Ext.log.error('M25 Monitor: ошибка парсинга ответа', e);
                    Ext.Msg.alert(l('Ошибка'), l('Некорректный ответ от сервера PILOT.'));
                }
            },
            failure: function(response) {
                Ext.log.error('M25 Monitor: ошибка загрузки /ax/tree.php', response.status);
                Ext.Msg.alert(l('Ошибка'), l('Не удалось загрузить список объектов. Проверьте соединение.'));
            },
            scope: me
        });
    },

    /**
     * Рекурсивная фильтрация: оставляем только группы, содержащие M25, и сами M25-объекты
     * @param {Array} nodes
     * @return {Array}
     */
    filterM25Nodes: function(nodes) {
        var result = [];
        var me = this;

        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            var equipment = node.equipment || '';
            var hasM25 = equipment.toLowerCase().indexOf('m25') !== -1;

            if (isVehicle) {
                if (hasM25) {
                    result.push(me.normalizeVehicleNode(node));
                }
            } else {
                // Группа – обрабатываем детей
                var children = node.children || [];
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
     * Приводит узел транспортного средства к формату TreeStore
     * @param {Object} vehNode
     * @return {Object}
     */
    normalizeVehicleNode: function(vehNode) {
        return {
            text: vehNode.text || l('Без имени'),
            vehid: vehNode.vehid,
            imei: vehNode.imei || '',
            equipment: vehNode.equipment || '',
            type: 'veh',
            leaf: true,
            iconCls: 'fa fa-car'
        };
    },

    /**
     * Приводит узел группы к формату TreeStore
     * @param {Object} groupNode
     * @return {Object}
     */
    normalizeGroupNode: function(groupNode) {
        return {
            text: groupNode.text || l('Папка'),
            type: 'group',
            leaf: false,
            expanded: false,
            children: []
        };
    },

    /**
     * Обработчик выбора объекта. Обновляет главную панель.
     * @param {Ext.data.NodeInterface} record
     */
    onVehicleSelect: function(record) {
        // Главная панель должна быть установлена из Module.js
        if (!this.mainPanel) {
            Ext.log.warn('M25 Monitor: mainPanel не установлен в Navigation');
            return;
        }

        var vehid = record.get('vehid');
        var vehicleName = record.get('text');

        // Формируем URL для iframe
        var baseUrl = 'https://mega-info.su/dealer2/';
        var url = baseUrl;
        if (vehid) {
            // Добавляем параметр vehicle_id (если сайт поддерживает)
            url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + 'vehicle_id=' + encodeURIComponent(vehid);
        }

        // Вызываем метод главной панели для загрузки URL
        if (this.mainPanel.loadUrl) {
            this.mainPanel.loadUrl(url, vehicleName);
        } else {
            // Прямое обновление iframe, если метод отсутствует
            if (this.mainPanel.iframe && this.mainPanel.iframe.getIframeDom) {
                var iframeDom = this.mainPanel.iframe.getIframeDom();
                if (iframeDom) {
                    iframeDom.src = url;
                    this.mainPanel.currentIframeSrc = url;
                }
            }
            // Обновляем текст в тулбаре
            var infoText = this.mainPanel.down('#infoText');
            if (infoText) {
                infoText.update('<span style="color:#2563eb;">' + l('Текущий объект: ') + Ext.String.htmlEncode(vehicleName) + '</span>');
            }
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
