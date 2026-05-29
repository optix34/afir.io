/**
 * Vehicle.js
 * Модель транспортного средства для расширения M25 Monitor.
 * 
 * Описывает структуру данных объекта, загружаемого из PILOT и отфильтрованного по оборудованию M25.
 * 
 * @class Store.m25_monitor.model.Vehicle
 * @extends Ext.data.Model
 */
Ext.define('Store.m25_monitor.model.Vehicle', {
    extend: 'Ext.data.Model',

    // Поля модели
    fields: [
        { name: 'id',          type: 'int',    persist: false },   // внутренний идентификатор (vehid)
        { name: 'name',        type: 'string', defaultValue: '' }, // название объекта (text)
        { name: 'vehid',       type: 'int',    persist: false },   // уникальный ID транспортного средства в PILOT
        { name: 'imei',        type: 'string', defaultValue: '' }, // IMEI трекера
        { name: 'equipment',   type: 'string', defaultValue: '' }, // модель оборудования (должно содержать "M25")
        { name: 'type',        type: 'string', defaultValue: 'veh' }, // тип узла: 'veh' или 'group'
        { name: 'rawData',     type: 'auto',   persist: false }    // оригинальные данные из API (для отладки)
    ],

    /**
     * Проверяет, является ли транспортное средство M25-совместимым
     * @return {Boolean}
     */
    isM25: function() {
        var eq = this.get('equipment') || '';
        return eq.toLowerCase().indexOf('m25') !== -1;
    },

    /**
     * Возвращает отображаемое имя
     * @return {String}
     */
    getDisplayName: function() {
        return this.get('name') || l('Без имени');
    },

    /**
     * Возвращает IMEI или строку "—"
     * @return {String}
     */
    getImeiDisplay: function() {
        return this.get('imei') || '—';
    },

    /**
     * Возвращает оборудование или строку "—"
     * @return {String}
     */
    getEquipmentDisplay: function() {
        return this.get('equipment') || '—';
    }
});
