/**
 * MainPanel.js – правая панель с iframe и панелью инструментов.
 */
Ext.define('Store.m25_monitor.view.MainPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.m25monitor-mainpanel',

    layout: 'fit',
    title: l('M25 Monitor — внешняя страница'),

    initComponent: function() {
        this.createIframe();
        this.createToolbar();
        this.items = [this.iframe];
        this.dockedItems = [this.toolbar];
        this.callParent(arguments);
    },

    createIframe: function() {
        this.iframe = Ext.create('Ext.Component', {
            autoEl: {
                tag: 'iframe',
                src: 'about:blank',
                style: 'width: 100%; height: 100%; border: none;'
            },
            getIframeDom: function() {
                return this.getEl().dom;
            }
        });
        this.currentIframeSrc = 'about:blank';
    },

    createToolbar: function() {
        var me = this;
        this.toolbar = Ext.create('Ext.toolbar.Toolbar', {
            dock: 'top',
            items: [
                {
                    text: l('Обновить'),
                    iconCls: 'fa fa-refresh',
                    handler: function() {
                        var iframeEl = me.iframe.getIframeDom();
                        if (iframeEl) iframeEl.src = me.currentIframeSrc;
                    }
                },
                {
                    text: l('Открыть в новом окне'),
                    iconCls: 'fa fa-external-link',
                    handler: function() {
                        if (me.currentIframeSrc && me.currentIframeSrc !== 'about:blank') {
                            window.open(me.currentIframeSrc, '_blank');
                        } else {
                            Ext.Msg.alert(l('Информация'), l('Сначала выберите объект.'));
                        }
                    }
                },
                '->',
                {
                    xtype: 'component',
                    html: '<span style="color:#888;">' + l('Выберите объект в левой панели') + '</span>',
                    itemId: 'infoText'
                }
            ]
        });
    },

    loadUrl: function(url, vehicleName) {
        var iframeDom = this.iframe.getIframeDom();
        if (iframeDom) {
            iframeDom.src = url;
            this.currentIframeSrc = url;
        }
        var infoText = this.down('#infoText');
        if (infoText && vehicleName) {
            infoText.update('<span style="color:#2563eb;">' + l('Текущий объект: ') + Ext.String.htmlEncode(vehicleName) + '</span>');
        }
    }
});
