/**
 * Vehicles.js
 * Хранилище для управления списком транспортных средств с оборудованием M25.
 * 
 * Загружает данные из /ax/tree.php, фильтрует по полю equipment (M25)
 * и предоставляет методы для работы с отфильтрованным списком.
 * 
 * @class Store.m25_monitor.store.Vehicles
 * @extends Ext.data.Store
 */
Ext.define('Store.m25_monitor.store.Vehicles', {
    extend: 'Ext.data.Store',
    alias: 'store.m25monitor-vehicles',

    // Модель для транспортного средства (можно использовать и без модели)
    model: 'Store.m25_monitor.model.Vehicle',

    // Автоматическая загрузка при создании
    autoLoad: true,

    // Поля для сортировки и фильтрации
    sorters: [{
        property: 'name',
        direction: 'ASC'
    }],

    /**
     * Прокси для загрузки данных из PILOT API
     */
    proxy: {
        type: 'ajax',
        url: '/ax/tree.php',
        extraParams: {
            vehs: 1,
            state: 1
        },
        reader: {
            type: 'json',
            rootProperty: 'data',
            transform: {
                fn: function(data, reader) {
                    // data — это массив, полученный от /ax/tree.php
                    // Преобразуем его в плоский список отфильтрованных транспортных средств
                    return this.filterM25Vehicles(data);
                },
                scope: this
            }
        }
    },

    /**
     * Рекурсивно обходит дерево и возвращает плоский массив транспортных средств с M25
     * @param {Array} nodes
     * @return {Array} массив объектов транспортных средств
     */
    filterM25Vehicles: function(nodes) {
        var result = [];
        var me = this;

        Ext.Array.each(nodes, function(node) {
            var isVehicle = (node.type === 'veh' || node.vehid);
            var equipment = node.equipment || '';
            var hasM25 = equipment.toLowerCase().indexOf('m25') !== -1;

            if (isVehicle && hasM25) {
                // Добавляем транспорт в результат
                result.push(me.normalizeVehicle(node));
            } else if (node.children && node.children.length) {
                // Рекурсивно обходим детей группы
                result = result.concat(me.filterM25Vehicles(node.children));
            }
        });

        return result;
    },

    /**
     * Нормализует узел транспортного средства к единому формату
     * @param {Object} vehNode
     * @return {Object}
     */
    normalizeVehicle: function(vehNode) {
        return {
            id: vehNode.vehid,
            name: vehNode.text || l('Без имени'),
            vehid: vehNode.vehid,
            imei: vehNode.imei || '',
            equipment: vehNode.equipment || '',
            // Сохраняем оригинальные данные на случай расширения
            rawData: vehNode
        };
    },

    /**
     * Получить транспортное средство по vehid
     * @param {Number|String} vehid
     * @return {Ext.data.Model|null}
     */
    getByVehid: function(vehid) {
        return this.findRecord('vehid', vehid, 0, false, true, true);
    },

    /**
     * Получить список всех IMEI (для отладки или дополнительных функций)
     * @return {Array}
     */
    getAllImei: function() {
        var imeis = [];
        this.each(function(record) {
            var imei = record.get('imei');
            if (imei) imeis.push(imei);
        });
        return imeis;
    },

    /**
     * Перезагрузить данные с сервера
     */
    refresh: function() {
        this.load();
    }
});
