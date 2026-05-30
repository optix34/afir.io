/**
 * MainPanel.js — правая панель (основная область) для M25 Monitor.
 * Содержит iframe для отображения внешней страницы и тулбар с кнопками.
 */
Ext.define('Store.m25_monitor.view.MainPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.m25monitor-mainpanel',

    layout: 'fit',
    title: 'M25 Monitor — внешняя страница',

    currentIframeSrc: 'about:blank',
    iframe: null,
    loadingMask: null,

    // Безопасная локализация
    l: function(text) {
        return (typeof l === 'function') ? l(text) : text;
    },

    initComponent: function() {
        this.createIframe();
        this.createToolbar();
        this.items = [this.iframe];
        this.dockedItems = [this.toolbar];
        this.callParent(arguments);
        this.loadingMask = new Ext.LoadMask(this.getEl(), { msg: this.l('Загрузка...') });
    },

    createIframe: function() {
        var me = this;
        this.iframe = Ext.create('Ext.Component', {
            autoEl: {
                tag: 'iframe',
                src: this.currentIframeSrc,
                style: 'width: 100%; height: 100%; border: none;'
            },
            getIframeDom: function() {
                var el = this.getEl();
                return el ? el.dom : null;
            },
            listeners: {
                afterrender: function() {
                    var iframeDom = this.getIframeDom();
                    if (iframeDom) {
                        iframeDom.onload = function() {
                            me.loadingMask.hide();
                        };
                        iframeDom.onerror = function() {
                            me.loadingMask.hide();
                            Ext.Msg.alert(me.l('Ошибка'), me.l('Не удалось загрузить страницу. Возможно, сайт запрещает встраивание в iframe.'));
                        };
                    }
                }
            }
        });
    },

    createToolbar: function() {
        var me = this;
        this.toolbar = Ext.create('Ext.toolbar.Toolbar', {
            dock: 'top',
            items: [
                {
                    text: me.l('Обновить'),
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        var iframeDom = me.iframe.getIframeDom();
                        if (iframeDom && me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            me.loadingMask.show();
                            iframeDom.src = me.currentIframeSrc;
                            // Таймаут на случай, если iframe.onload не сработает
                            Ext.defer(function() { me.loadingMask.hide(); }, 10000);
                        } else {
                            Ext.Msg.alert(me.l('Информация'), me.l('Нет загруженной страницы для обновления.'));
                        }
                    }
                },
                {
                    text: me.l('Открыть в новом окне'),
                    iconCls: 'fa fa-external-link',
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            window.open(me.currentIframeSrc, '_blank');
                        } else {
                            Ext.Msg.alert(me.l('Информация'), me.l('Сначала выберите объект в левой панели.'));
                        }
                    }
                },
                {
                    text: me.l('Открыть в безопасном режиме'),
                    iconCls: 'fa fa-shield-alt',
                    tooltip: me.l('Открыть страницу в новой вкладке, если iframe заблокирован'),
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            window.open(me.currentIframeSrc, '_blank');
                            Ext.Msg.alert(me.l('Внимание'), me.l('Страница открыта в новом окне из-за ограничений безопасности.'));
                        }
                    }
                },
                '->',
                {
                    xtype: 'component',
                    html: '<span style="color:#64748b;">' + me.l('Выберите объект в левой панели') + '</span>',
                    itemId: 'infoText'
                }
            ]
        });
    },

    loadUrl: function(url, vehicleName) {
        var me = this;
        if (!url) return;

        var iframeDom = me.iframe.getIframeDom();
        if (iframeDom) {
            me.loadingMask.show();
            iframeDom.src = url;
            me.currentIframeSrc = url;
            // Таймаут на случай блокировки onload
            Ext.defer(function() { me.loadingMask.hide(); }, 10000);
        }

        var infoText = me.down('#infoText');
        if (infoText && vehicleName) {
            infoText.update('<span style="color:#2563eb;">' + me.l('Текущий объект: ') + Ext.String.htmlEncode(vehicleName) + '</span>');
        }
    },

    reset: function() {
        var iframeDom = this.iframe.getIframeDom();
        if (iframeDom) {
            iframeDom.src = 'about:blank';
            this.currentIframeSrc = 'about:blank';
        }
        var infoText = this.down('#infoText');
        if (infoText) {
            infoText.update('<span style="color:#64748b;">' + this.l('Выберите объект в левой панели') + '</span>');
        }
    }
});
