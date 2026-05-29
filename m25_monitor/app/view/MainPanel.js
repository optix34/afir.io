/**
 * MainPanel.js
 * Главная панель расширения M25 Monitor
 * 
 * Содержит iframe для отображения внешней страницы https://mega-info.su/dealer2/
 * Панель инструментов: обновить iframe, открыть в новом окне, информация о выбранном объекте.
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
     * Текущий URL в iframe
     */
    currentIframeSrc: 'about:blank',

    /**
     * Текущее имя выбранного объекта
     */
    currentVehicleName: null,

    initComponent: function() {
        // Создаём панель инструментов
        this.tbar = this.createToolbar();

        // Создаём iframe компонент
        this.iframe = this.createIframe();

        // Основные элементы
        this.items = [this.iframe];

        this.callParent(arguments);

        // Ссылка на саму панель (для использования в обработчиках)
        this.iframe.ownerPanel = this;
    },

    /**
     * Создаёт панель инструментов
     * @return {Ext.toolbar.Toolbar}
     */
    createToolbar: function() {
        var me = this;

        return Ext.create('Ext.toolbar.Toolbar', {
            items: [
                {
                    text: l('Обновить'),
                    iconCls: 'fa fa-refresh',
                    tooltip: l('Перезагрузить страницу'),
                    handler: me.onRefresh,
                    scope: me
                },
                {
                    text: l('Открыть в новом окне'),
                    iconCls: 'fa fa-external-link',
                    tooltip: l('Открыть текущую страницу в новой вкладке браузера'),
                    handler: me.onOpenInNewWindow,
                    scope: me
                },
                '->',
                {
                    xtype: 'component',
                    itemId: 'infoText',
                    html: '<span style="color:#64748b;">' + l('Выберите объект в левой панели') + '</span>',
                    style: 'font-size:12px;'
                }
            ],
            cls: 'm25-monitor-toolbar'
        });
    },

    /**
     * Создаёт iframe компонент
     * @return {Ext.Component}
     */
    createIframe: function() {
        var me = this;

        var iframeComp = Ext.create('Ext.Component', {
            autoEl: {
                tag: 'iframe',
                src: 'about:blank',
                style: 'width: 100%; height: 100%; border: none; background: #f1f5f9;',
                class: 'm25-monitor-iframe'
            },
            listeners: {
                // Слушаем событие загрузки iframe (реализовано через делегирование)
                render: function(cmp) {
                    var iframeEl = cmp.getEl().dom;
                    iframeEl.addEventListener('load', function() {
                        me.onIframeLoad(iframeEl);
                    });
                    iframeEl.addEventListener('error', function() {
                        me.onIframeError(iframeEl);
                    });
                },
                scope: me
            }
        });

        return iframeComp;
    },

    /**
     * Загружает указанный URL в iframe
     * @param {String} url
     * @param {String} vehicleName (опционально)
     */
    loadUrl: function(url, vehicleName) {
        var me = this;
        var iframeEl = this.iframe.getEl().dom;

        if (!iframeEl) return;

        // Сохраняем имя для отображения в тулбаре
        this.currentVehicleName = vehicleName || l('Объект');
        this.currentIframeSrc = url;

        // Показываем индикатор загрузки (добавляем класс к родительскому элементу)
        var body = this.getEl();
        if (body) {
            body.addCls('m25-monitor-iframe-loading');
        }

        // Устанавливаем src – начинаем загрузку
        iframeEl.src = url;

        // Обновляем информационный текст в тулбаре
        var infoText = this.down('#infoText');
        if (infoText) {
            infoText.update('<span style="color:#2563eb;">' + l('Текущий объект: ') + Ext.String.htmlEncode(this.currentVehicleName) + '</span>');
        }
    },

    /**
     * Обработчик успешной загрузки iframe
     * @param {HTMLIFrameElement} iframeEl
     */
    onIframeLoad: function(iframeEl) {
        // Убираем индикатор загрузки
        var body = this.getEl();
        if (body) {
            body.removeCls('m25-monitor-iframe-loading');
        }

        // Пытаемся определить, заблокировано ли встраивание (X-Frame-Options)
        // Если доступ к содержимому iframe вызывает исключение, значит страница не позволяет себя встраивать,
        // но сам iframe загрузился, поэтому дополнительных действий не требуется.
        try {
            var doc = iframeEl.contentDocument || iframeEl.contentWindow.document;
            // Если дошли сюда – доступ есть, страница возможно не блокирует фреймы
            Ext.log('M25 Monitor: iframe загружен, доступ к документу есть');
        } catch (e) {
            // Ошибка доступа – нормально для большинства внешних сайтов
            Ext.log('M25 Monitor: iframe загружен, но доступ к содержимому запрещён (X-Frame-Options)');
        }
    },

    /**
     * Обработчик ошибки загрузки iframe
     * @param {HTMLIFrameElement} iframeEl
     */
    onIframeError: function(iframeEl) {
        var body = this.getEl();
        if (body) {
            body.removeCls('m25-monitor-iframe-loading');
        }

        // Показываем сообщение об ошибке в тулбаре или во всплывающем окне
        var infoText = this.down('#infoText');
        if (infoText) {
            infoText.update('<span style="color:#b91c1c;">' + l('Ошибка загрузки страницы. Возможно, сайт запрещает встраивание. Используйте кнопку "Открыть в новом окне".') + '</span>');
        } else {
            Ext.Msg.warning(l('Ошибка'), l('Не удалось загрузить страницу. Попробуйте открыть в новом окне.'));
        }
    },

    /**
     * Обработчик кнопки "Обновить"
     */
    onRefresh: function() {
        var iframeEl = this.iframe.getEl().dom;
        if (iframeEl && this.currentIframeSrc !== 'about:blank') {
            // Перезагружаем iframe, сохраняя текущий src
            iframeEl.src = this.currentIframeSrc;
        } else {
            Ext.Msg.alert(l('Информация'), l('Сначала выберите объект.'));
        }
    },

    /**
     * Обработчик кнопки "Открыть в новом окне"
     */
    onOpenInNewWindow: function() {
        if (this.currentIframeSrc && this.currentIframeSrc !== 'about:blank') {
            window.open(this.currentIframeSrc, '_blank');
        } else {
            Ext.Msg.alert(l('Информация'), l('Сначала выберите объект.'));
        }
    },

    /**
     * Сброс состояния (очистка iframe, сброс информации)
     */
    reset: function() {
        var iframeEl = this.iframe.getEl().dom;
        if (iframeEl) {
            iframeEl.src = 'about:blank';
        }
        this.currentIframeSrc = 'about:blank';
        this.currentVehicleName = null;

        var infoText = this.down('#infoText');
        if (infoText) {
            infoText.update('<span style="color:#64748b;">' + l('Выберите объект в левой панели') + '</span>');
        }
    }
});
