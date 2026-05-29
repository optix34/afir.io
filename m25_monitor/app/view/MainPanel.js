/**
 * MainPanel.js — правая панель (основная область) для M25 Monitor.
 * Содержит iframe для отображения внешней страницы и тулбар с кнопками управления.
 *
 * @class Store.m25_monitor.view.MainPanel
 * @extends Ext.panel.Panel
 */
Ext.define('Store.m25_monitor.view.MainPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.m25monitor-mainpanel',

    layout: 'fit',
    title: l('M25 Monitor — внешняя страница'),

    /**
     * Текущий URL, загруженный в iframe
     * @property {String} currentIframeSrc
     */
    currentIframeSrc: 'about:blank',

    /**
     * Ссылка на iframe-компонент
     * @property {Ext.Component} iframe
     */
    iframe: null,

    /**
     * Ссылка на тулбар
     * @property {Ext.toolbar.Toolbar} toolbar
     */
    toolbar: null,

    initComponent: function() {
        this.createIframe();
        this.createToolbar();
        this.items = [this.iframe];
        this.dockedItems = [this.toolbar];
        this.callParent(arguments);
    },

    /**
     * Создаёт iframe-компонент с методом getIframeDom для доступа к DOM-элементу
     */
    createIframe: function() {
        this.iframe = Ext.create('Ext.Component', {
            autoEl: {
                tag: 'iframe',
                src: this.currentIframeSrc,
                style: 'width: 100%; height: 100%; border: none;'
            },
            /**
             * Возвращает DOM-элемент iframe
             * @return {HTMLIFrameElement}
             */
            getIframeDom: function() {
                var el = this.getEl();
                return el ? el.dom : null;
            }
        });
    },

    /**
     * Создаёт тулбар с кнопками "Обновить", "Открыть в новом окне" и информационной строкой
     */
    createToolbar: function() {
        var me = this;

        this.toolbar = Ext.create('Ext.toolbar.Toolbar', {
            dock: 'top',
            items: [
                {
                    text: l('Обновить'),
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        var iframeDom = me.iframe.getIframeDom();
                        if (iframeDom && me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            // Принудительная перезагрузка iframe
                            iframeDom.src = me.currentIframeSrc;
                        } else {
                            Ext.Msg.alert(l('Информация'), l('Нет загруженной страницы для обновления.'));
                        }
                    },
                    scope: me
                },
                {
                    text: l('Открыть в новом окне'),
                    iconCls: 'fa fa-external-link',
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            window.open(me.currentIframeSrc, '_blank');
                        } else {
                            Ext.Msg.alert(l('Информация'), l('Сначала выберите объект в левой панели.'));
                        }
                    },
                    scope: me
                },
                '->', // Растягивающийся разделитель
                {
                    xtype: 'component',
                    html: '<span style="color:#64748b;">' + l('Выберите объект в левой панели') + '</span>',
                    itemId: 'infoText'
                }
            ]
        });
    },

    /**
     * Загружает указанный URL в iframe и обновляет информационную строку.
     * Вызывается из Navigation.js при выборе транспортного средства.
     * @param {String} url - URL для загрузки
     * @param {String} vehicleName - название транспортного средства (опционально)
     */
    loadUrl: function(url, vehicleName) {
        var me = this;
        if (!url) {
            Ext.log.warn('[M25] loadUrl called without URL');
            return;
        }

        var iframeDom = me.iframe.getIframeDom();
        if (iframeDom) {
            iframeDom.src = url;
            me.currentIframeSrc = url;
            Ext.log('[M25] Loaded URL in iframe: ' + url);
        } else {
            Ext.log.error('[M25] Cannot get iframe DOM element');
            return;
        }

        // Обновляем информационную строку в тулбаре
        var infoText = me.down('#infoText');
        if (infoText && vehicleName) {
            var safeName = Ext.String.htmlEncode(vehicleName);
            infoText.update('<span style="color:#2563eb;">' + l('Текущий объект: ') + safeName + '</span>');
        } else if (infoText && !vehicleName) {
            infoText.update('<span style="color:#64748b;">' + l('Выберите объект в левой панели') + '</span>');
        }
    },

    /**
     * Сброс iframe (загружает about:blank) и очищает информационную строку
     */
    reset: function() {
        var iframeDom = this.iframe.getIframeDom();
        if (iframeDom) {
            iframeDom.src = 'about:blank';
            this.currentIframeSrc = 'about:blank';
        }
        var infoText = this.down('#infoText');
        if (infoText) {
            infoText.update('<span style="color:#64748b;">' + l('Выберите объект в левой панели') + '</span>');
        }
    }
});
