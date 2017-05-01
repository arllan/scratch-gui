const bindAll = require('lodash.bindall');
const defaultsDeep = require('lodash.defaultsdeep');
const PropTypes = require('prop-types');
const React = require('react');
const {connect} = require('react-redux');
const VMScratchBlocks = require('../lib/blocks');
const VM = require('scratch-vm');
const Prompt = require('./prompt.jsx');
const BlocksComponent = require('../components/blocks/blocks.jsx');
const {getSpriteToolbox, getStageToolbox, getSpeechToolbox} = require('../lib/toolbox-xml');

const addFunctionListener = (object, property, callback) => {
    const oldFn = object[property];
    object[property] = function () {
        const result = oldFn.apply(this, arguments);
        callback.apply(this, result);
        return result;
    };
};

class Blocks extends React.Component {
    constructor (props) {
        super(props);
        this.ScratchBlocks = VMScratchBlocks(props.vm);
        bindAll(this, [
            'attachVM',
            'detachVM',
            'handlePromptStart',
            'handlePromptCallback',
            'handlePromptClose',
            'onScriptGlowOn',
            'onScriptGlowOff',
            'onBlockGlowOn',
            'onBlockGlowOff',
            'onVisualReport',
            'onWorkspaceUpdate',
            'onWorkspaceMetricsChange',
            'setBlocks'
        ]);
        this.ScratchBlocks.prompt = this.handlePromptStart;
        this.state = {
            workspaceMetrics: {},
            prompt: null
        };
    }
    componentDidMount () {
        const workspaceConfig = defaultsDeep({
            toolbox: this.props.toolbox || this.ScratchBlocks.Blocks.defaultToolbox
        }, Blocks.defaultOptions, this.props.options);
        this.workspace = this.ScratchBlocks.inject(this.blocks, workspaceConfig);
        window.workspace = this.workspace;
        // @todo change this when blockly supports UI events
        addFunctionListener(this.workspace, 'translate', this.onWorkspaceMetricsChange);
        addFunctionListener(this.workspace, 'zoom', this.onWorkspaceMetricsChange);

        this.attachVM();
    }
    shouldComponentUpdate () {
        // return false;
        return true;
    }
    componentDidUpdate (prevProps) {
        if (prevProps.toolbox !== this.props.toolbox) {
            this.workspace.updateToolbox(this.props.toolbox);
        }
    }
    componentWillUnmount () {
        this.detachVM();
        this.workspace.dispose();
    }
    attachVM () {
        this.workspace.addChangeListener(this.props.vm.blockListener);
        this.workspace
            .getFlyout()
            .getWorkspace()
            .addChangeListener(this.props.vm.flyoutBlockListener);
        this.props.vm.addListener('SCRIPT_GLOW_ON', this.onScriptGlowOn);
        this.props.vm.addListener('SCRIPT_GLOW_OFF', this.onScriptGlowOff);
        this.props.vm.addListener('BLOCK_GLOW_ON', this.onBlockGlowOn);
        this.props.vm.addListener('BLOCK_GLOW_OFF', this.onBlockGlowOff);
        this.props.vm.addListener('VISUAL_REPORT', this.onVisualReport);
        this.props.vm.addListener('workspaceUpdate', this.onWorkspaceUpdate);
    }
    detachVM () {
        this.props.vm.removeListener('SCRIPT_GLOW_ON', this.onScriptGlowOn);
        this.props.vm.removeListener('SCRIPT_GLOW_OFF', this.onScriptGlowOff);
        this.props.vm.removeListener('BLOCK_GLOW_ON', this.onBlockGlowOn);
        this.props.vm.removeListener('BLOCK_GLOW_OFF', this.onBlockGlowOff);
        this.props.vm.removeListener('VISUAL_REPORT', this.onVisualReport);
        this.props.vm.removeListener('workspaceUpdate', this.onWorkspaceUpdate);
    }

    onWorkspaceMetricsChange () {
        const target = this.props.vm.editingTarget;
        if (target && target.id) {
            const workspaceMetrics = Object.assign({}, this.state.workspaceMetrics, {
                [target.id]: {
                    scrollX: this.workspace.scrollX,
                    scrollY: this.workspace.scrollY,
                    scale: this.workspace.scale
                }
            });
            this.setState({workspaceMetrics});
        }
    }
    onScriptGlowOn (data) {
        this.workspace.glowStack(data.id, true);
    }
    onScriptGlowOff (data) {
        this.workspace.glowStack(data.id, false);
    }
    onBlockGlowOn (data) {
        this.workspace.glowBlock(data.id, true);
    }
    onBlockGlowOff (data) {
        this.workspace.glowBlock(data.id, false);
    }
    onVisualReport (data) {
        this.workspace.reportValue(data.id, data.value);
    }
    onWorkspaceUpdate (data) {
        if (this.props.vm.editingTarget && !this.state.workspaceMetrics[this.props.vm.editingTarget.id]) {
            this.onWorkspaceMetricsChange();
        }

        this.ScratchBlocks.Events.disable();
        this.workspace.clear();

        const dom = this.ScratchBlocks.Xml.textToDom(data.xml);
        this.ScratchBlocks.Xml.domToWorkspace(dom, this.workspace);
        this.ScratchBlocks.Events.enable();
        this.workspace.toolbox_.refreshSelection();

        if (this.props.vm.editingTarget && this.state.workspaceMetrics[this.props.vm.editingTarget.id]) {
            const {scrollX, scrollY, scale} = this.state.workspaceMetrics[this.props.vm.editingTarget.id];
            this.workspace.scrollX = scrollX;
            this.workspace.scrollY = scrollY;
            this.workspace.scale = scale;
            this.workspace.resize();
        }
    }
    setBlocks (blocks) {
        this.blocks = blocks;
    }
    handlePromptStart (message, defaultValue, callback) {
        this.setState({prompt: {callback, message, defaultValue}});
    }
    handlePromptCallback (data) {
        this.state.prompt.callback(data);
        this.handlePromptClose();
    }
    handlePromptClose () {
        this.setState({prompt: null});
    }
    render () {
        const {
            options, // eslint-disable-line no-unused-vars
            vm, // eslint-disable-line no-unused-vars
            toolbox, // eslint-disable-line no-unused-vars
            ...props
        } = this.props;
        return (
            <div>
                <BlocksComponent
                    componentRef={this.setBlocks}
                    {...props}
                />
                {this.state.prompt ? (
                    <Prompt
                        label={this.state.prompt.message}
                        placeholder={this.state.prompt.defaultValue}
                        title="New Variable" // @todo the only prompt is for new variables
                        onCancel={this.handlePromptClose}
                        onOk={this.handlePromptCallback}
                    />
                ) : null}
            </div>
        );
    }
}

Blocks.propTypes = {
    options: React.PropTypes.shape({
        media: React.PropTypes.string,
        zoom: React.PropTypes.shape({
            controls: React.PropTypes.boolean,
            wheel: React.PropTypes.boolean,
            startScale: React.PropTypes.number
        }),
        colours: React.PropTypes.shape({
            workspace: React.PropTypes.string,
            flyout: React.PropTypes.string,
            toolbox: React.PropTypes.string,
            toolboxSelected: React.PropTypes.string,
            scrollbar: React.PropTypes.string,
            scrollbarHover: React.PropTypes.string,
            insertionMarker: React.PropTypes.string,
            insertionMarkerOpacity: React.PropTypes.number,
            fieldShadow: React.PropTypes.string,
            dragShadowOpacity: React.PropTypes.number
        })
    }),
    toolbox: React.PropTypes.string,
    vm: React.PropTypes.instanceOf(VM).isRequired
};

Blocks.defaultOptions = {
    zoom: {
        controls: true,
        wheel: true,
        startScale: 0.75
    },
    grid: {
        spacing: 40,
        length: 2,
        colour: '#ddd'
    },
    colours: {
        workspace: '#F9F9F9',
        flyout: '#F9F9F9',
        toolbox: '#FFFFFF',
        toolboxSelected: '#E9EEF2',
        scrollbar: '#CECDCE',
        scrollbarHover: '#CECDCE',
        insertionMarker: '#000000',
        insertionMarkerOpacity: 0.2,
        fieldShadow: 'rgba(255, 255, 255, 0.3)',
        dragShadowOpacity: 0.6
    }
};

Blocks.defaultProps = {
    options: Blocks.defaultOptions
};

// @todo: add toolbox reducer
// @todo: connect toolbox state and dispatch to blocks props

const mapStateToProps = state => ({
    toolbox: state.toolbox.currentToolbox
});

const mapDispatchToProps = dispatch => ({
});

module.exports = connect(
    mapStateToProps,
    mapDispatchToProps
)(Blocks);
