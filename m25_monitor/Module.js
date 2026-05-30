/**
 * M25 Monitor - PILOT Extension
 * Точка входа. Создаёт главную панель, передавая ей заголовок.
 */
Ext.define('Store.m25_monitor.Module', {
    extend: 'Ext.Component',

    // Технический идентификатор расширения (для прокси /store/m25_monitor/...)
    extensionName: 'm25_monitor',

    // Отображаемое название панели (можно менять здесь)
    panelTitle: 'M25 Monitor — все объекты клиента',

    /**
     * Инициализация расширения
     */
    initModule: function() {
        console.log('[M25] Инициализация расширения (все объекты клиента)...');

        if (!window.skeleton || !skeleton.mapframe) {
            console.warn('[M25] Skeleton.mapframe не готов, повтор через 500ms');
            Ext.defer(this.initModule, 500, this);
            return;
        }

        // Подключаем CSS – используем абсолютный путь через прокси PILOT
        var cssUrl = '/store/m25_monitor/view/style.css';
        if (!document.querySelector('link[href="' + cssUrl + '"]')) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssUrl;
            link.onerror = function() {
                console.warn('[M25] Не удалось загрузить CSS по пути: ' + cssUrl);
            };
            document.head.appendChild(link);
        }

        // Создаём главную панель, передавая заголовок
        var mainPanel = Ext.create('Store.m25_monitor.view.MainPanel', {
            id: 'm25monitor-mainpanel-' + Ext.id(),
            panelTitle: this.panelTitle
        });

        skeleton.mapframe.add(mainPanel);
        console.log('[M25] Расширение загружено, заголовок панели: ' + this.panelTitle);
    }
});
